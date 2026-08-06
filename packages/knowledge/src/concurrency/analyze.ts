import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gateConcurrencyBounds } from "./bounds";
import { detectConcurrencyCandidates } from "./detect";
import { evaluateConcurrencyOracle } from "./oracles";
import {
  CONCURRENCY_DEFAULT_BOUNDS,
  CONCURRENCY_EVIDENCE_SCHEMA_VERSION,
  type ConcurrencyCleanupEvidence,
  type ConcurrencyExperimentInput,
  type ConcurrencyRepairTask,
  type ConcurrencySafetyReport,
  type ConcurrencyTargetKind,
  type ConcurrencyVerdict
} from "./types";

export interface AnalyzeConcurrencySafetyOptions {
  rootDir: string;
  experimentFile?: string | undefined;
  experiment?: ConcurrencyExperimentInput | undefined;
  surfaceFiles?: string[] | undefined;
  cleanupPlan?: string | undefined;
  targetKind?: ConcurrencyTargetKind | undefined;
  generatedAt?: string | undefined;
}

export function analyzeConcurrencySafety(options: AnalyzeConcurrencySafetyOptions): ConcurrencySafetyReport {
  const rootDir = realpathSync(options.rootDir);
  const experiment = options.experiment ?? loadExperiment(rootDir, options.experimentFile);
  const candidates = detectConcurrencyCandidates(rootDir, options.surfaceFiles ?? []);
  const limitations = [
    "Deterministic fixture oracles do not prove production race freedom.",
    "No distributed scheduler, production queue, or remote HTTP target was contacted.",
    "Keyword candidate detection is not proof; attach a falsifiable invariant and approved experiment.",
    "A passing low-repetition stress run cannot silently prove absence of races."
  ];
  const blockers: string[] = [];
  const investigationTasks: string[] = [];
  const repairTasks: ConcurrencyRepairTask[] = [];

  if (!experiment) {
    limitations.unshift("No concurrency experiment fixture was supplied.");
    for (const candidate of candidates) {
      investigationTasks.push(
        `Map ${candidate.kind} surface ${candidate.surface} to invariant ${candidate.suggestedInvariant} and attach a seeded schedule oracle.`
      );
    }
    return baseReport({
      generatedAt: options.generatedAt,
      verdict: candidates.length ? "plan-ready" : "needs-human",
      bounds: {
        maxParallelism: CONCURRENCY_DEFAULT_BOUNDS.maxParallelism,
        repetitions: CONCURRENCY_DEFAULT_BOUNDS.repetitions,
        timeoutMs: CONCURRENCY_DEFAULT_BOUNDS.timeoutMs,
        targetKind: options.targetKind ?? "unspecified"
      },
      boundsBlocked: false,
      candidates,
      cleanup: createCleanup(options.cleanupPlan, options.targetKind ?? "unspecified"),
      repairTasks: [],
      treeStatus: "unverified",
      blockers: options.targetKind === "production-like" || options.targetKind === "remote-unapproved"
        ? [`Target kind "${options.targetKind}" is blocked for concurrency experiments.`]
        : [],
      investigationTasks,
      limitations
    });
  }

  const bounds = {
    ...experiment.bounds,
    targetKind: options.targetKind ?? experiment.bounds.targetKind
  };
  const gate = gateConcurrencyBounds(bounds);
  const cleanup = createCleanup(options.cleanupPlan ?? experiment.cleanup?.plan, bounds.targetKind);

  if (gate.blocked) {
    blockers.push(...gate.reasons);
    return baseReport({
      generatedAt: options.generatedAt,
      experimentId: experiment.id,
      experimentKind: experiment.kind,
      verdict: "bounds-blocked",
      invariant: experiment.stateOracle.invariant,
      bounds: gate.effective,
      boundsBlocked: true,
      candidates,
      cleanup,
      repairTasks: [],
      treeStatus: "unverified",
      blockers,
      investigationTasks: [
        "Reduce parallelism, repetitions, timeout, or network target to configured disposable bounds before execution."
      ],
      limitations
    });
  }

  const oracle = evaluateConcurrencyOracle({ ...experiment, bounds: gate.effective });
  let verdict: ConcurrencyVerdict = oracle.verdict;

  if (experiment.kind === "probabilistic-stress") {
    verdict = "inconclusive-stress";
    limitations.push("Stress-only results stay inconclusive and cannot become verified safety.");
  }

  if (verdict === "confirmed-race") {
    investigationTasks.push(
      `Confirmed race against invariant ${experiment.stateOracle.invariant}; capture timeline seed ${oracle.seed} and recommend a durable regression test.`
    );
    repairTasks.push({
      id: `repair:${experiment.id}`,
      title: `Fix confirmed concurrency defect ${experiment.id}`,
      detail: `Oracle verdict confirmed-race for invariant ${experiment.stateOracle.invariant}. sideEffectCount=${oracle.sideEffectCount}, finalState=${oracle.finalState}.`
    });
  }

  if (verdict === "passed-oracle") {
    investigationTasks.push(
      `Oracle passed for ${experiment.id}; keep the seeded schedule as a regression fixture and do not claim full production verification.`
    );
  }

  if (verdict === "inconclusive-stress") {
    investigationTasks.push(
      "Replace stress-only evidence with a deterministic barrier schedule before treating the path as safe."
    );
  }

  let treeStatus: ConcurrencySafetyReport["treeStatus"] = "unverified";
  if (verdict === "confirmed-race" && experiment.repair?.durableRegressionTestId) {
    repairTasks.push({
      id: `regression:${experiment.id}`,
      title: "Add durable concurrency regression test",
      detail: `Attach and keep ${experiment.repair.durableRegressionTestId} as the durable regression for the confirmed defect.`,
      durableRegressionTestId: experiment.repair.durableRegressionTestId
    });
    if (experiment.repair.revalidated === true) {
      treeStatus = "revalidated-fixture";
      investigationTasks.push(
        `Revalidated fixture tree against ${experiment.repair.durableRegressionTestId} with the same seed plus alternate schedule evidence.`
      );
    }
  }

  if (cleanup.required && !cleanup.plan) {
    blockers.push("Cleanup plan is required for disposable concurrency targets.");
    verdict = "needs-human";
  }

  return baseReport({
    generatedAt: options.generatedAt,
    experimentId: experiment.id,
    experimentKind: experiment.kind,
    verdict,
    invariant: experiment.stateOracle.invariant,
    bounds: gate.effective,
    boundsBlocked: false,
    candidates,
    oracle,
    cleanup,
    repairTasks,
    treeStatus,
    blockers,
    investigationTasks,
    limitations
  });
}

function loadExperiment(rootDir: string, file?: string): ConcurrencyExperimentInput | undefined {
  if (!file) return undefined;
  const absolute = resolve(rootDir, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Concurrency experiment file not found: ${file}`);
  }
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as ConcurrencyExperimentInput;
  if (!parsed?.id || !parsed.kind || !parsed.stateOracle || !parsed.bounds || !parsed.schedule) {
    throw new Error(`Concurrency experiment file is missing required fields: ${file}`);
  }
  return parsed;
}

function createCleanup(plan: string | undefined, targetKind: ConcurrencyTargetKind): ConcurrencyCleanupEvidence {
  const required = targetKind === "fixture-local" || targetKind === "disposable-local";
  return {
    plan,
    required,
    proven: false,
    requiredOnFailure: true,
    limitations: [
      "Cleanup plans are recorded but not executed in this deterministic oracle slice.",
      "Cleanup failure or ambiguous target forces needs-human before any future execution adapter."
    ]
  };
}

function baseReport(input: {
  generatedAt?: string | undefined;
  experimentId?: string | undefined;
  experimentKind?: ConcurrencySafetyReport["experimentKind"];
  verdict: ConcurrencyVerdict;
  invariant?: ConcurrencySafetyReport["invariant"];
  bounds: ConcurrencySafetyReport["bounds"];
  boundsBlocked: boolean;
  candidates: ConcurrencySafetyReport["candidates"];
  oracle?: ConcurrencySafetyReport["oracle"];
  cleanup: ConcurrencyCleanupEvidence;
  repairTasks: ConcurrencyRepairTask[];
  treeStatus: ConcurrencySafetyReport["treeStatus"];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
}): ConcurrencySafetyReport {
  return {
    tool: "CodeDecay",
    schemaVersion: CONCURRENCY_EVIDENCE_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    experimentId: input.experimentId,
    experimentKind: input.experimentKind,
    verdict: input.verdict,
    fullyVerified: false,
    invariant: input.invariant,
    bounds: input.bounds,
    boundsBlocked: input.boundsBlocked,
    candidates: input.candidates,
    oracle: input.oracle,
    cleanup: input.cleanup,
    repairTasks: input.repairTasks,
    treeStatus: input.treeStatus,
    extensionBoundaries: [
      { id: "queues", status: "planned", detail: "Queue framework adapters remain extension points." },
      { id: "webhooks", status: "planned", detail: "Provider webhook redelivery adapters remain extension points." },
      { id: "cron-jobs", status: "planned", detail: "Cron overlap experiments remain extension points." },
      { id: "distributed-locks", status: "planned", detail: "Distributed lock adapters remain extension points." },
      { id: "transactional-outbox", status: "planned", detail: "Outbox dual-write adapters remain extension points." }
    ],
    blockers: input.blockers,
    investigationTasks: input.investigationTasks,
    limitations: input.limitations,
    safety: {
      commandsExecuted: false,
      productionTargetAllowed: false,
      networkCalled: false,
      schedulerSpawned: false,
      secretsRead: false
    }
  };
}
