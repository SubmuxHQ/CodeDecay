export const STATE_SPACE_EVIDENCE_SCHEMA_VERSION = 1 as const;

export const STATE_SPACE_DEFAULT_BOUNDS = {
  maxDimensions: 8,
  maxCombinations: 32,
  timeoutMs: 30_000
} as const;

export type StateSpaceTargetKind =
  | "unspecified"
  | "fixture-local"
  | "disposable-local"
  | "remote-unapproved"
  | "production-like";

export type StateSpaceCacheState =
  | "cold"
  | "warm"
  | "stale"
  | "missing"
  | "malformed"
  | "expired"
  | "invalidated";

export type StateSpaceVerdict =
  | "confirmed-regression"
  | "expected-flag-behavior"
  | "passed-oracle"
  | "insufficient-state-model"
  | "flaky-suspicion"
  | "setup-failure"
  | "untested-combination"
  | "bounds-blocked"
  | "provider-blocked"
  | "needs-human"
  | "plan-ready";

export type StateSpaceDimensionKind =
  | "feature-flag"
  | "config-value"
  | "cache-state"
  | "cache-version"
  | "actor-tenant"
  | "rollout-cohort"
  | "revision";

export type StateSpaceExperimentKind = "pairwise-matrix" | "impact-guided" | "explicit-matrix";

export interface StateSpaceBounds {
  maxDimensions: number;
  maxCombinations: number;
  timeoutMs: number;
  targetKind: StateSpaceTargetKind;
  allowRemoteFlagProvider?: boolean | undefined;
}

export interface StateSpaceDimension {
  id: string;
  kind: StateSpaceDimensionKind;
  values: string[];
  sourceRef: string;
  note: string;
}

export interface StateSpaceCombination {
  id: string;
  values: Record<string, string>;
  selected: boolean;
  exclusionReason?: string | undefined;
}

export interface StateSpaceOracleExpectation {
  /** Cache key that should be invalidated after write. */
  cacheKey?: string | undefined;
  /** Expected readable value after the write under the selected cache state. */
  expectedReadValue?: string | undefined;
  /** Flag ids that must all be on for the path to succeed. */
  requiredFlagsOn?: string[] | undefined;
  /** Forbidden combinations described as flagId=value pairs. */
  forbidden?: string[] | undefined;
}

export interface StateSpaceImplementation {
  /** Declared buggy/clean behavior for fixture evaluation. */
  mode: "stale-cache" | "flag-interaction-bug" | "clean" | "repaired";
  writeValue?: string | undefined;
  cachedValue?: string | undefined;
  flagEffects?: Record<string, "pass" | "fail"> | undefined;
}

export interface StateSpaceRepairEvidence {
  durableRegressionTestId?: string | undefined;
  revalidated?: boolean | undefined;
}

export interface StateSpaceExperimentInput {
  id: string;
  kind: StateSpaceExperimentKind;
  seed: number;
  dimensions: StateSpaceDimension[];
  /** Optional explicit combinations; otherwise pairwise generated. */
  combinations?: StateSpaceCombination[] | undefined;
  oracle: StateSpaceOracleExpectation;
  implementation: StateSpaceImplementation;
  bounds: StateSpaceBounds;
  cleanup?: { plan?: string | undefined } | undefined;
  repair?: StateSpaceRepairEvidence | undefined;
  remoteFlagProvider?: {
    configured: boolean;
    contacted?: boolean | undefined;
  } | undefined;
}

export interface StateSpaceCandidate {
  id: string;
  kind: StateSpaceDimensionKind;
  surface: string;
  sourceRef: string;
  citedEvidence: string[];
  note: string;
}

export interface StateSpaceCombinationResult {
  combinationId: string;
  values: Record<string, string>;
  status: "passed" | "failed" | "skipped" | "untested";
  detail: string;
}

export interface StateSpaceCoverageReport {
  selectedCount: number;
  testedCount: number;
  failedCount: number;
  skippedCount: number;
  untestedCount: number;
  prunedCount: number;
  exhaustive: false;
  limitations: string[];
}

export interface StateSpaceOracleResult {
  verdict: StateSpaceVerdict;
  seed: number;
  toolVersion: string;
  combinationResults: StateSpaceCombinationResult[];
  failures: string[];
}

export interface StateSpaceCleanupEvidence {
  plan?: string | undefined;
  required: boolean;
  proven: false;
  requiredOnFailure: true;
  limitations: string[];
}

export interface StateSpaceRepairTask {
  id: string;
  title: string;
  detail: string;
  durableRegressionTestId?: string | undefined;
}

export interface StateSpaceExtensionBoundary {
  id: string;
  status: "planned";
  detail: string;
}

export interface StateSpaceSafetyReport {
  tool: "CodeDecay";
  schemaVersion: typeof STATE_SPACE_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  experimentId?: string | undefined;
  experimentKind?: StateSpaceExperimentKind | undefined;
  verdict: StateSpaceVerdict;
  fullyVerified: false;
  bounds: StateSpaceBounds;
  boundsBlocked: boolean;
  candidates: StateSpaceCandidate[];
  dimensions: StateSpaceDimension[];
  combinations: StateSpaceCombination[];
  coverage: StateSpaceCoverageReport;
  oracle?: StateSpaceOracleResult | undefined;
  cleanup: StateSpaceCleanupEvidence;
  repairTasks: StateSpaceRepairTask[];
  treeStatus: "unverified" | "revalidated-fixture";
  extensionBoundaries: StateSpaceExtensionBoundary[];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
  safety: {
    commandsExecuted: false;
    productionTargetAllowed: false;
    networkCalled: false;
    remoteFlagProviderContacted: boolean;
    secretsRead: false;
  };
}
