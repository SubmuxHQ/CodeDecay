import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gateStateSpaceBounds } from "./bounds";
import { detectStateSpaceCandidates } from "./detect";
import { evaluateStateSpaceOracle, generateStateSpaceCombinations } from "./oracles";
import {
  STATE_SPACE_DEFAULT_BOUNDS,
  STATE_SPACE_EVIDENCE_SCHEMA_VERSION,
  type StateSpaceCleanupEvidence,
  type StateSpaceCoverageReport,
  type StateSpaceExperimentInput,
  type StateSpaceRepairTask,
  type StateSpaceSafetyReport,
  type StateSpaceTargetKind,
  type StateSpaceVerdict
} from "./types";

const TOOL_VERSION = "codedecay-state-space-oracle/1";

export interface AnalyzeStateSpaceSafetyOptions {
  rootDir: string;
  experimentFile?: string | undefined;
  experiment?: StateSpaceExperimentInput | undefined;
  surfaceFiles?: string[] | undefined;
  cleanupPlan?: string | undefined;
  targetKind?: StateSpaceTargetKind | undefined;
  generatedAt?: string | undefined;
}

export function analyzeStateSpaceSafety(options: AnalyzeStateSpaceSafetyOptions): StateSpaceSafetyReport {
  const rootDir = realpathSync(options.rootDir);
  const experiment = options.experiment ?? loadExperiment(rootDir, options.experimentFile);
  const candidates = detectStateSpaceCandidates(rootDir, options.surfaceFiles ?? []);
  const limitations = [
    "Bounded state-space matrices do not prove exhaustive flag/cache coverage.",
    "No production cache flush, flag mutation, or remote provider write was performed.",
    "Keyword candidate detection is not proof; attach explicit dimensions and oracles.",
    "Pruned combinations remain untested and must be reported as such."
  ];
  const blockers: string[] = [];
  const investigationTasks: string[] = [];
  const repairTasks: StateSpaceRepairTask[] = [];

  if (!experiment) {
    limitations.unshift("No state-space experiment fixture was supplied.");
    for (const candidate of candidates) {
      investigationTasks.push(
        `Promote ${candidate.kind} candidate ${candidate.surface} into an explicit dimension with bounded values.`
      );
    }
    return baseReport({
      generatedAt: options.generatedAt,
      verdict: candidates.length ? "plan-ready" : "needs-human",
      bounds: {
        maxDimensions: STATE_SPACE_DEFAULT_BOUNDS.maxDimensions,
        maxCombinations: STATE_SPACE_DEFAULT_BOUNDS.maxCombinations,
        timeoutMs: STATE_SPACE_DEFAULT_BOUNDS.timeoutMs,
        targetKind: options.targetKind ?? "unspecified"
      },
      boundsBlocked: false,
      candidates,
      dimensions: [],
      combinations: [],
      coverage: emptyCoverage(),
      cleanup: createCleanup(options.cleanupPlan, options.targetKind ?? "unspecified"),
      repairTasks: [],
      treeStatus: "unverified",
      blockers: [],
      investigationTasks,
      limitations,
      remoteFlagProviderContacted: false
    });
  }

  const bounds = {
    ...experiment.bounds,
    targetKind: options.targetKind ?? experiment.bounds.targetKind
  };
  const combinations = generateStateSpaceCombinations(
    experiment.dimensions,
    experiment.seed,
    bounds.maxCombinations,
    experiment.combinations
  );
  const gate = gateStateSpaceBounds(bounds, experiment.dimensions.length, combinations.filter((c) => c.selected).length);
  const cleanup = createCleanup(options.cleanupPlan ?? experiment.cleanup?.plan, bounds.targetKind);
  const remoteContacted = experiment.remoteFlagProvider?.contacted === true;
  const remoteConfigured = experiment.remoteFlagProvider?.configured === true;

  if (remoteContacted && !remoteConfigured) {
    blockers.push("Remote flag provider contact requires explicit configuration and command intent.");
    return baseReport({
      generatedAt: options.generatedAt,
      experimentId: experiment.id,
      experimentKind: experiment.kind,
      verdict: "provider-blocked",
      bounds: gate.effective,
      boundsBlocked: false,
      candidates,
      dimensions: experiment.dimensions,
      combinations,
      coverage: coverageFrom(combinations, []),
      cleanup,
      repairTasks: [],
      treeStatus: "unverified",
      blockers,
      investigationTasks: ["Configure a local/disposable flag adapter before contacting any remote provider."],
      limitations,
      remoteFlagProviderContacted: true
    });
  }

  if (gate.blocked) {
    blockers.push(...gate.reasons);
    return baseReport({
      generatedAt: options.generatedAt,
      experimentId: experiment.id,
      experimentKind: experiment.kind,
      verdict: "bounds-blocked",
      bounds: gate.effective,
      boundsBlocked: true,
      candidates,
      dimensions: experiment.dimensions,
      combinations,
      coverage: coverageFrom(combinations, []),
      cleanup,
      repairTasks: [],
      treeStatus: "unverified",
      blockers,
      investigationTasks: ["Reduce dimensions/combinations/timeout to configured disposable bounds."],
      limitations,
      remoteFlagProviderContacted: remoteContacted && remoteConfigured
    });
  }

  const oracleEval = evaluateStateSpaceOracle({ ...experiment, bounds: gate.effective }, combinations);
  let verdict: StateSpaceVerdict = oracleEval.verdict;
  const coverage = coverageFrom(combinations, oracleEval.combinationResults);

  if (verdict === "confirmed-regression") {
    investigationTasks.push(
      `Confirmed state-space regression for ${experiment.id}; preserve seed ${experiment.seed} and failing combinations.`
    );
    repairTasks.push({
      id: `repair:${experiment.id}`,
      title: `Fix confirmed state-space defect ${experiment.id}`,
      detail: oracleEval.failures.join(" ")
    });
  }

  if (verdict === "passed-oracle") {
    investigationTasks.push(
      `Oracle passed for ${experiment.id}; keep the selected matrix as a regression fixture. Coverage is not exhaustive.`
    );
  }

  let treeStatus: StateSpaceSafetyReport["treeStatus"] = "unverified";
  if (experiment.repair?.durableRegressionTestId) {
    repairTasks.push({
      id: `regression:${experiment.id}`,
      title: "Add durable state-space regression test",
      detail: `Attach ${experiment.repair.durableRegressionTestId} for the confirmed matrix failure.`,
      durableRegressionTestId: experiment.repair.durableRegressionTestId
    });
  }
  if (experiment.implementation.mode === "repaired" && experiment.repair?.revalidated === true) {
    treeStatus = "revalidated-fixture";
    verdict = "passed-oracle";
    investigationTasks.push(
      `Revalidated state matrix on the current tree using ${experiment.repair.durableRegressionTestId ?? "fixture oracle"}.`
    );
  }

  if (cleanup.required && !cleanup.plan) {
    blockers.push("Cleanup plan is required for disposable state-space targets.");
    verdict = "needs-human";
  }

  investigationTasks.push(
    `Coverage: tested=${coverage.testedCount}, failed=${coverage.failedCount}, untested=${coverage.untestedCount}, pruned=${coverage.prunedCount}.`
  );

  return baseReport({
    generatedAt: options.generatedAt,
    experimentId: experiment.id,
    experimentKind: experiment.kind,
    verdict,
    bounds: gate.effective,
    boundsBlocked: false,
    candidates,
    dimensions: experiment.dimensions,
    combinations,
    coverage,
    oracle: {
      verdict,
      seed: experiment.seed,
      toolVersion: TOOL_VERSION,
      combinationResults: oracleEval.combinationResults,
      failures: oracleEval.failures
    },
    cleanup,
    repairTasks,
    treeStatus,
    blockers,
    investigationTasks,
    limitations,
    remoteFlagProviderContacted: remoteContacted && remoteConfigured
  });
}

function loadExperiment(rootDir: string, file?: string): StateSpaceExperimentInput | undefined {
  if (!file) return undefined;
  const absolute = resolve(rootDir, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`State-space experiment file not found: ${file}`);
  }
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as StateSpaceExperimentInput;
  if (!parsed?.id || !parsed.kind || !parsed.dimensions || !parsed.bounds || parsed.seed === undefined) {
    throw new Error(`State-space experiment file is missing required fields: ${file}`);
  }
  return parsed;
}

function createCleanup(plan: string | undefined, targetKind: StateSpaceTargetKind): StateSpaceCleanupEvidence {
  const required = targetKind === "fixture-local" || targetKind === "disposable-local";
  return {
    plan,
    required,
    proven: false,
    requiredOnFailure: true,
    limitations: [
      "Cleanup plans are recorded but not executed in this deterministic oracle slice.",
      "No production cache flush or flag mutation is allowed."
    ]
  };
}

function emptyCoverage(): StateSpaceCoverageReport {
  return {
    selectedCount: 0,
    testedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    untestedCount: 0,
    prunedCount: 0,
    exhaustive: false,
    limitations: ["No combinations were generated."]
  };
}

function coverageFrom(
  combinations: StateSpaceSafetyReport["combinations"],
  results: NonNullable<StateSpaceSafetyReport["oracle"]>["combinationResults"]
): StateSpaceCoverageReport {
  const byId = new Map(results.map((item) => [item.combinationId, item]));
  let testedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let untestedCount = 0;
  let prunedCount = 0;
  for (const combination of combinations) {
    if (!combination.selected) {
      prunedCount += 1;
      untestedCount += 1;
      continue;
    }
    const result = byId.get(combination.id);
    if (!result || result.status === "untested") {
      untestedCount += 1;
      continue;
    }
    if (result.status === "skipped") skippedCount += 1;
    else {
      testedCount += 1;
      if (result.status === "failed") failedCount += 1;
    }
  }
  return {
    selectedCount: combinations.filter((item) => item.selected).length,
    testedCount,
    failedCount,
    skippedCount,
    untestedCount,
    prunedCount,
    exhaustive: false,
    limitations: ["Generated coverage is bounded and never implies exhaustive state-space proof."]
  };
}

function baseReport(input: {
  generatedAt?: string | undefined;
  experimentId?: string | undefined;
  experimentKind?: StateSpaceSafetyReport["experimentKind"];
  verdict: StateSpaceVerdict;
  bounds: StateSpaceSafetyReport["bounds"];
  boundsBlocked: boolean;
  candidates: StateSpaceSafetyReport["candidates"];
  dimensions: StateSpaceSafetyReport["dimensions"];
  combinations: StateSpaceSafetyReport["combinations"];
  coverage: StateSpaceCoverageReport;
  oracle?: StateSpaceSafetyReport["oracle"];
  cleanup: StateSpaceCleanupEvidence;
  repairTasks: StateSpaceRepairTask[];
  treeStatus: StateSpaceSafetyReport["treeStatus"];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
  remoteFlagProviderContacted: boolean;
}): StateSpaceSafetyReport {
  return {
    tool: "CodeDecay",
    schemaVersion: STATE_SPACE_EVIDENCE_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    experimentId: input.experimentId,
    experimentKind: input.experimentKind,
    verdict: input.verdict,
    fullyVerified: false,
    bounds: input.bounds,
    boundsBlocked: input.boundsBlocked,
    candidates: input.candidates,
    dimensions: input.dimensions,
    combinations: input.combinations,
    coverage: input.coverage,
    oracle: input.oracle,
    cleanup: input.cleanup,
    repairTasks: input.repairTasks,
    treeStatus: input.treeStatus,
    extensionBoundaries: [
      { id: "launchdarkly", status: "planned", detail: "LaunchDarkly adapter boundary without hidden network access." },
      { id: "unleash", status: "planned", detail: "Unleash adapter boundary for local fixtures." },
      { id: "redis-cache", status: "planned", detail: "Disposable Redis/cache testcontainer adapter." },
      { id: "config-flags", status: "planned", detail: "Repo-local config flag files remain first-class." }
    ],
    blockers: input.blockers,
    investigationTasks: input.investigationTasks,
    limitations: input.limitations,
    safety: {
      commandsExecuted: false,
      productionTargetAllowed: false,
      networkCalled: false,
      remoteFlagProviderContacted: input.remoteFlagProviderContacted,
      secretsRead: false
    }
  };
}
