import type {
  ConcurrencyExperimentInput,
  ConcurrencyOracleResult,
  ConcurrencyTimelineEvent,
  ConcurrencyVerdict
} from "./types";

const TOOL_VERSION = "codedecay-concurrency-oracle/1";

/**
 * Deterministic in-process oracle over seeded fixture schedules.
 * This is not a distributed scheduler; it evaluates declared implementation modes.
 */
export function evaluateConcurrencyOracle(experiment: ConcurrencyExperimentInput): ConcurrencyOracleResult {
  if (experiment.kind === "probabilistic-stress") {
    return {
      verdict: "inconclusive-stress",
      sideEffectCount: 0,
      finalState: 0,
      attemptIds: [],
      timeline: [],
      failures: [
        "Probabilistic stress-only evidence cannot prove absence of races; treat as inconclusive."
      ],
      seed: experiment.schedule.seed,
      repetitions: experiment.bounds.repetitions,
      toolVersion: TOOL_VERSION
    };
  }

  if (experiment.schedule.steps.length === 0) {
    return emptyResult(experiment, "unsupported-scheduler", ["Deterministic schedule has no steps."]);
  }

  const sorted = [...experiment.schedule.steps].sort((a, b) => a.at - b.at || a.operationId.localeCompare(b.operationId));
  const operations = new Map(experiment.operations.map((op) => [op.id, op]));
  const timeline: ConcurrencyTimelineEvent[] = [];
  const attemptIds: string[] = [];
  const seenKeys = new Set<string>();
  let sideEffectCount = 0;
  let state = 0;
  const failures: string[] = [];

  // Group read-modify-write steps that share a barrier for lost-update simulation.
  const sharedReadBaselines = new Map<string, number>();

  for (const step of sorted) {
    const operation = operations.get(step.operationId);
    if (!operation) {
      failures.push(`Unknown operation ${step.operationId}.`);
      continue;
    }
    const attemptId = `${experiment.schedule.seed}:${step.at}:${step.actor}:${operation.id}`;
    attemptIds.push(attemptId);
    const stateBefore = state;
    let delta = 0;

    if (operation.type === "read-modify-write") {
      const amount = operation.amount ?? 1;
      if (experiment.implementation.mode === "lost-update") {
        const barrierKey = step.barrier ?? `at:${step.at}`;
        if (!sharedReadBaselines.has(barrierKey)) {
          sharedReadBaselines.set(barrierKey, state);
        }
        const baseline = sharedReadBaselines.get(barrierKey) ?? state;
        // Last writer wins from the shared read — classic lost update.
        state = baseline + amount;
        delta = amount;
        sideEffectCount += 1;
      } else if (experiment.implementation.mode === "versioned-update") {
        state += amount;
        delta = amount;
        sideEffectCount += 1;
      } else if (experiment.implementation.mode === "idempotent") {
        const key = operation.payloadKey;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          state += amount;
          delta = amount;
          sideEffectCount += 1;
        }
      } else {
        state += amount;
        delta = amount;
        sideEffectCount += 1;
      }
    } else {
      const key = operation.payloadKey;
      const amount = operation.amount ?? 1;
      if (experiment.implementation.mode === "idempotent") {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          delta = amount;
          sideEffectCount += 1;
          state += amount;
        }
      } else {
        delta = amount;
        sideEffectCount += 1;
        state += amount;
      }
    }

    timeline.push({
      at: step.at,
      actor: step.actor,
      operationId: operation.id,
      attemptId,
      barrier: step.barrier,
      sideEffectDelta: delta,
      stateBefore,
      stateAfter: state
    });
  }

  const verdict = resolveVerdict(experiment, sideEffectCount, state, failures);
  return {
    verdict,
    sideEffectCount,
    finalState: state,
    attemptIds,
    timeline,
    failures,
    seed: experiment.schedule.seed,
    repetitions: experiment.bounds.repetitions,
    toolVersion: TOOL_VERSION
  };
}

function resolveVerdict(
  experiment: ConcurrencyExperimentInput,
  sideEffectCount: number,
  finalState: number,
  failures: string[]
): ConcurrencyVerdict {
  if (failures.length) return "environment-failure";
  const oracle = experiment.stateOracle;

  if (oracle.invariant === "exactly-once-effect" || oracle.invariant === "at-least-once-safe") {
    const expected = oracle.expectedSideEffects ?? 1;
    if (sideEffectCount === expected) return "passed-oracle";
    return "confirmed-race";
  }

  if (oracle.invariant === "no-lost-update" || oracle.invariant === "monotonic-state") {
    const expected = oracle.expectedFinalValue;
    if (expected === undefined) {
      failures.push("State oracle missing expectedFinalValue for lost-update / monotonic checks.");
      return "environment-failure";
    }
    if (finalState === expected) return "passed-oracle";
    return "confirmed-race";
  }

  if (oracle.invariant === "bounded-retries") {
    const maxAttempts = experiment.retryPolicy?.maxAttempts ?? experiment.bounds.repetitions;
    if (sideEffectCount <= maxAttempts) return "passed-oracle";
    return "confirmed-race";
  }

  if (oracle.invariant === "compensating-action") {
    if (sideEffectCount <= (oracle.expectedSideEffects ?? 1)) return "passed-oracle";
    return "confirmed-race";
  }

  return "needs-human";
}

function emptyResult(
  experiment: ConcurrencyExperimentInput,
  verdict: ConcurrencyVerdict,
  failures: string[]
): ConcurrencyOracleResult {
  return {
    verdict,
    sideEffectCount: 0,
    finalState: 0,
    attemptIds: [],
    timeline: [],
    failures,
    seed: experiment.schedule.seed,
    repetitions: experiment.bounds.repetitions,
    toolVersion: TOOL_VERSION
  };
}
