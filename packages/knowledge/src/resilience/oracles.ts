import type {
  ResilienceCellResult,
  ResilienceExperimentInput,
  ResilienceMatrixCell,
  ResilienceVerdict
} from "./types";

export function generateResilienceCells(
  experiment: ResilienceExperimentInput,
  maxCells = 16
): ResilienceMatrixCell[] {
  if (experiment.cells?.length) {
    return experiment.cells.map((cell, index) => ({
      ...cell,
      selected: index < maxCells && cell.selected !== false,
      exclusionReason: index < maxCells ? cell.exclusionReason : "Pruned by matrix bound."
    }));
  }
  const faults: ResilienceExperimentInput["fault"]["mode"][] = [
    experiment.fault.mode,
    "recovery"
  ];
  const cells: ResilienceMatrixCell[] = [];
  for (const producerVersion of ["old", "new"] as const) {
    for (const consumerVersion of ["old", "new"] as const) {
      for (const fault of faults) {
        cells.push({
          id: `${producerVersion}->${consumerVersion}:${fault}`,
          producerVersion,
          consumerVersion,
          fault,
          selected: true
        });
      }
    }
  }
  return cells.map((cell, index) => ({
    ...cell,
    selected: index < maxCells,
    exclusionReason: index < maxCells ? undefined : "Pruned by matrix bound; coverage is not exhaustive."
  }));
}

export function evaluateResilienceOracle(
  experiment: ResilienceExperimentInput,
  cells: ResilienceMatrixCell[]
): { verdict: ResilienceVerdict; results: ResilienceCellResult[]; failures: string[] } {
  const results: ResilienceCellResult[] = [];
  const failures: string[] = [];
  const boundRetries = experiment.bounds.maxRetries;
  const perAttempt = experiment.implementation.sideEffectPerAttempt ?? 1;

  for (const cell of cells) {
    if (!cell.selected) {
      results.push({
        cellId: cell.id,
        status: "untested",
        detail: cell.exclusionReason ?? "Not selected.",
        sideEffectCount: 0,
        retryCount: 0,
        recovered: false
      });
      continue;
    }

    if (experiment.implementation.mode === "unbounded-retry" && experiment.retryPolicy?.applicationRetriesIndefinitely) {
      const capped = boundRetries;
      results.push({
        cellId: cell.id,
        status: "failed",
        detail: `Application retries indefinitely; experiment bound capped retries at ${capped}.`,
        sideEffectCount: (capped + 1) * perAttempt,
        retryCount: capped,
        recovered: false
      });
      failures.push(`${cell.id}: retry bound enforced`);
      continue;
    }

    if (experiment.implementation.mode === "unsafe-retry" && cell.fault === "timeout") {
      const retries = Math.min(experiment.retryPolicy?.maxAttempts ?? 3, boundRetries);
      const sideEffects = (retries + 1) * perAttempt;
      const expected = experiment.oracle.expectedSideEffects ?? 1;
      results.push({
        cellId: cell.id,
        status: sideEffects > expected ? "failed" : "passed",
        detail:
          sideEffects > expected
            ? `Dependency timeout caused ${sideEffects} side effects (expected ≤${expected}).`
            : "Side effects stayed within oracle.",
        sideEffectCount: sideEffects,
        retryCount: retries,
        recovered: false
      });
      if (sideEffects > expected) failures.push(`${cell.id}: unsafe retries`);
      continue;
    }

    if (
      experiment.implementation.mode === "incompatible-mixed-version" &&
      cell.producerVersion === "new" &&
      cell.consumerVersion === "old"
    ) {
      const parseOk = experiment.implementation.canParseNewResponse === true;
      results.push({
        cellId: cell.id,
        status: parseOk ? "passed" : "failed",
        detail: parseOk
          ? "Old consumer parsed new producer response."
          : "Old consumer cannot parse new producer response during rolling deploy.",
        sideEffectCount: 0,
        retryCount: 0,
        recovered: false
      });
      if (!parseOk) failures.push(`${cell.id}: mixed-version parse failure`);
      continue;
    }

    if (experiment.implementation.mode === "correct-fallback" || experiment.implementation.mode === "repaired") {
      const recovered = experiment.implementation.recovers !== false;
      const sideEffects = experiment.oracle.expectedSideEffects ?? 1;
      results.push({
        cellId: cell.id,
        status: recovered ? "passed" : "failed",
        detail: recovered
          ? `Fallback/recovery passed under ${cell.fault} with producer=${cell.producerVersion} consumer=${cell.consumerVersion}.`
          : "Recovery failed.",
        sideEffectCount: sideEffects,
        retryCount: Math.min(1, boundRetries),
        recovered
      });
      if (!recovered) failures.push(`${cell.id}: recovery failed`);
      continue;
    }

    results.push({
      cellId: cell.id,
      status: "passed",
      detail: `No failing oracle condition for ${cell.fault}.`,
      sideEffectCount: experiment.oracle.expectedSideEffects ?? 0,
      retryCount: 0,
      recovered: cell.fault === "recovery"
    });
  }

  if (failures.length) return { verdict: "confirmed-defect", results, failures };
  return { verdict: "passed-oracle", results, failures };
}
