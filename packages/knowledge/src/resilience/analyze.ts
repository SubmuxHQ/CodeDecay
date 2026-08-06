import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gateResilienceBounds, isProductionLikeTarget } from "./bounds";
import { detectResilienceCandidates } from "./detect";
import { evaluateResilienceOracle, generateResilienceCells } from "./oracles";
import {
  RESILIENCE_DEFAULT_BOUNDS,
  RESILIENCE_EVIDENCE_SCHEMA_VERSION,
  type ResilienceCleanupEvidence,
  type ResilienceExperimentInput,
  type ResilienceSafetyReport,
  type ResilienceTargetKind,
  type ResilienceVerdict
} from "./types";

export interface AnalyzeResilienceSafetyOptions {
  rootDir: string;
  experimentFile?: string | undefined;
  experiment?: ResilienceExperimentInput | undefined;
  surfaceFiles?: string[] | undefined;
  cleanupPlan?: string | undefined;
  targetKind?: ResilienceTargetKind | undefined;
  generatedAt?: string | undefined;
}

export function analyzeResilienceSafety(options: AnalyzeResilienceSafetyOptions): ResilienceSafetyReport {
  const rootDir = realpathSync(options.rootDir);
  const experiment = options.experiment ?? loadExperiment(rootDir, options.experimentFile);
  const candidates = detectResilienceCandidates(rootDir, options.surfaceFiles ?? []);
  const limitations = [
    "Bounded fault matrices do not prove general resilience.",
    "No production traffic interception, chaos action, or infrastructure mutation was performed.",
    "A passing happy-path or single fault mode cannot establish general resilience.",
    "Keyword candidates are suggestions only."
  ];
  const blockers: string[] = [];
  const investigationTasks: string[] = [];
  const repairTasks: ResilienceSafetyReport["repairTasks"] = [];

  if (!experiment) {
    return base({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      verdict: candidates.length ? "plan-ready" : "needs-human",
      bounds: defaultBounds(options.targetKind),
      boundsBlocked: false,
      candidates,
      cells: [],
      coverage: emptyCoverage(),
      cellResults: [],
      cleanup: createCleanup(options.cleanupPlan, options.targetKind ?? "unspecified", false),
      repairTasks: [],
      treeStatus: "unverified",
      blockers: [],
      investigationTasks: candidates.map(
        (c) => `Map candidate ${c.surface} to fault ${c.suggestedFault} with a disposable oracle.`
      ),
      limitations: ["No resilience experiment fixture was supplied.", ...limitations]
    });
  }

  const bounds = { ...experiment.bounds, targetKind: options.targetKind ?? experiment.bounds.targetKind };
  if (isProductionLikeTarget(bounds.targetKind) || bounds.targetKind === "unspecified") {
    blockers.push(`Target kind "${bounds.targetKind}" is blocked; use fixture-local or disposable-local only.`);
    return base({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      experimentId: experiment.id,
      experimentKind: experiment.kind,
      verdict: "target-blocked",
      bounds,
      boundsBlocked: false,
      candidates,
      cells: [],
      coverage: emptyCoverage(),
      cellResults: [],
      cleanup: createCleanup(options.cleanupPlan ?? experiment.cleanup?.plan, bounds.targetKind, false),
      repairTasks: [],
      treeStatus: "unverified",
      blockers,
      investigationTasks: ["Retarget the experiment to a disposable local topology."],
      limitations
    });
  }

  const gate = gateResilienceBounds(bounds);
  const cells = generateResilienceCells(experiment, 16);
  const cleanup = createCleanup(
    options.cleanupPlan ?? experiment.cleanup?.plan,
    bounds.targetKind,
    experiment.cleanup?.recovered === true
  );

  if (gate.blocked) {
    blockers.push(...gate.reasons);
    return base({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      experimentId: experiment.id,
      experimentKind: experiment.kind,
      verdict: "bounds-blocked",
      bounds,
      boundsBlocked: true,
      candidates,
      cells,
      coverage: coverageFrom(cells, []),
      cellResults: [],
      cleanup,
      repairTasks: [],
      treeStatus: "unverified",
      blockers,
      investigationTasks: ["Reduce retries/requests/timeout/fault duration to configured bounds."],
      limitations
    });
  }

  const evaluated = evaluateResilienceOracle({ ...experiment, bounds }, cells);
  let verdict: ResilienceVerdict = evaluated.verdict;
  const coverage = coverageFrom(cells, evaluated.results);

  if (verdict === "confirmed-defect") {
    investigationTasks.push(`Confirmed resilience defect for ${experiment.id}; preserve seed ${experiment.seed}.`);
    repairTasks.push({
      id: `repair:${experiment.id}`,
      title: `Fix confirmed resilience defect ${experiment.id}`,
      detail: evaluated.failures.join(" ")
    });
  }

  if (experiment.repair?.durableRegressionTestId) {
    repairTasks.push({
      id: `regression:${experiment.id}`,
      title: "Add durable resilience regression test",
      detail: `Attach ${experiment.repair.durableRegressionTestId}.`,
      durableRegressionTestId: experiment.repair.durableRegressionTestId
    });
  }

  let treeStatus: ResilienceSafetyReport["treeStatus"] = "unverified";
  if (experiment.implementation.mode === "repaired" && experiment.repair?.revalidated === true) {
    treeStatus = "revalidated-fixture";
    verdict = "passed-oracle";
    investigationTasks.push(
      `Reverified happy path, fault path, and mixed-version path using ${experiment.repair.durableRegressionTestId ?? "fixture"}.`
    );
  }

  if (cleanup.required && !cleanup.plan) {
    blockers.push("Cleanup plan is required.");
    verdict = "needs-human";
  }
  if (cleanup.required && experiment.cleanup?.recovered === false) {
    blockers.push("Failed recovery/cleanup prevents a verified verdict.");
    verdict = "needs-human";
  }

  investigationTasks.push(
    `Coverage: tested=${coverage.testedCount}, failed=${coverage.failedCount}, untested=${coverage.untestedCount}.`
  );

  return base({
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    experimentId: experiment.id,
    experimentKind: experiment.kind,
    verdict,
    bounds,
    boundsBlocked: false,
    candidates,
    cells,
    coverage,
    cellResults: evaluated.results,
    cleanup,
    repairTasks,
    treeStatus,
    blockers,
    investigationTasks,
    limitations
  });
}

function loadExperiment(rootDir: string, file?: string): ResilienceExperimentInput | undefined {
  if (!file) return undefined;
  const absolute = resolve(rootDir, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`Resilience experiment not found: ${file}`);
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as ResilienceExperimentInput;
  if (!parsed?.id || !parsed.kind || !parsed.bounds || parsed.seed === undefined) {
    throw new Error(`Resilience experiment missing required fields: ${file}`);
  }
  return parsed;
}

function defaultBounds(targetKind?: ResilienceTargetKind): ResilienceSafetyReport["bounds"] {
  return {
    maxRetries: RESILIENCE_DEFAULT_BOUNDS.maxRetries,
    maxRequests: RESILIENCE_DEFAULT_BOUNDS.maxRequests,
    timeoutMs: RESILIENCE_DEFAULT_BOUNDS.timeoutMs,
    maxFaultDurationMs: RESILIENCE_DEFAULT_BOUNDS.maxFaultDurationMs,
    targetKind: targetKind ?? "unspecified"
  };
}

function createCleanup(plan: string | undefined, targetKind: ResilienceTargetKind, recovered: boolean): ResilienceCleanupEvidence {
  const required = targetKind === "fixture-local" || targetKind === "disposable-local";
  return {
    plan,
    required,
    proven: false,
    recovered,
    requiredOnFailure: true,
    limitations: ["Cleanup/recovery are recorded but not executed in this deterministic oracle slice."]
  };
}

function emptyCoverage(): ResilienceSafetyReport["coverage"] {
  return {
    selectedCount: 0,
    testedCount: 0,
    failedCount: 0,
    untestedCount: 0,
    exhaustive: false,
    limitations: ["No cells generated."]
  };
}

function coverageFrom(
  cells: ResilienceSafetyReport["cells"],
  results: ResilienceSafetyReport["cellResults"]
): ResilienceSafetyReport["coverage"] {
  const byId = new Map(results.map((r) => [r.cellId, r]));
  let testedCount = 0;
  let failedCount = 0;
  let untestedCount = 0;
  for (const cell of cells) {
    if (!cell.selected) {
      untestedCount += 1;
      continue;
    }
    const result = byId.get(cell.id);
    if (!result || result.status === "untested") {
      untestedCount += 1;
      continue;
    }
    testedCount += 1;
    if (result.status === "failed") failedCount += 1;
  }
  return {
    selectedCount: cells.filter((c) => c.selected).length,
    testedCount,
    failedCount,
    untestedCount,
    exhaustive: false,
    limitations: ["Fault coverage is bounded and never implies general resilience."]
  };
}

function base(input: Omit<ResilienceSafetyReport, "tool" | "schemaVersion" | "fullyVerified" | "extensionBoundaries" | "safety"> & {
  generatedAt?: string | undefined;
}): ResilienceSafetyReport {
  return {
    tool: "CodeDecay",
    schemaVersion: RESILIENCE_EVIDENCE_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    experimentId: input.experimentId,
    experimentKind: input.experimentKind,
    verdict: input.verdict,
    fullyVerified: false,
    bounds: input.bounds,
    boundsBlocked: input.boundsBlocked,
    candidates: input.candidates,
    cells: input.cells,
    coverage: input.coverage,
    cellResults: input.cellResults,
    cleanup: input.cleanup,
    repairTasks: input.repairTasks,
    treeStatus: input.treeStatus,
    extensionBoundaries: [
      { id: "toxiproxy", status: "planned", detail: "Toxiproxy-class proxy adapter for latency/reset faults." },
      { id: "testcontainers", status: "planned", detail: "Disposable service containers for mixed-version runs." },
      { id: "service-virtualization", status: "planned", detail: "Stub/malformed response adapters." },
      { id: "contract-tools", status: "planned", detail: "Contract checks for producer/consumer compatibility." }
    ],
    blockers: input.blockers,
    investigationTasks: input.investigationTasks,
    limitations: input.limitations,
    safety: {
      commandsExecuted: false,
      productionTargetAllowed: false,
      networkCalled: false,
      chaosInjected: false,
      secretsRead: false
    }
  };
}
