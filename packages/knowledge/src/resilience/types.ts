export const RESILIENCE_EVIDENCE_SCHEMA_VERSION = 1 as const;

export const RESILIENCE_DEFAULT_BOUNDS = {
  maxRetries: 5,
  maxRequests: 20,
  timeoutMs: 30_000,
  maxFaultDurationMs: 10_000
} as const;

export type ResilienceTargetKind =
  | "unspecified"
  | "fixture-local"
  | "disposable-local"
  | "remote-unapproved"
  | "production-like";

export type ResilienceFaultMode =
  | "latency"
  | "timeout"
  | "connection-refused"
  | "connection-reset"
  | "http-5xx"
  | "malformed-response"
  | "recovery";

export type ResilienceVerdict =
  | "confirmed-defect"
  | "expected-degraded"
  | "passed-oracle"
  | "unsupported-fault"
  | "environment-failure"
  | "flaky-suspicion"
  | "bounds-blocked"
  | "target-blocked"
  | "needs-human"
  | "plan-ready";

export type ResilienceExperimentKind = "fault-matrix" | "mixed-version" | "explicit-matrix";

export interface ResilienceBounds {
  maxRetries: number;
  maxRequests: number;
  timeoutMs: number;
  maxFaultDurationMs: number;
  targetKind: ResilienceTargetKind;
}

export interface ResilienceServiceVersion {
  serviceId: string;
  version: "old" | "new";
  role: "producer" | "consumer" | "dependency";
}

export interface ResilienceFaultProfile {
  mode: ResilienceFaultMode;
  injectionPoint: string;
  durationMs: number;
}

export interface ResilienceOracle {
  expectedSideEffects?: number | undefined;
  allowDegraded?: boolean | undefined;
  requireRecovery?: boolean | undefined;
  requireParseSuccess?: boolean | undefined;
}

export interface ResilienceImplementation {
  mode:
    | "unsafe-retry"
    | "incompatible-mixed-version"
    | "correct-fallback"
    | "unbounded-retry"
    | "repaired";
  sideEffectPerAttempt?: number | undefined;
  canParseNewResponse?: boolean | undefined;
  recovers?: boolean | undefined;
}

export interface ResilienceMatrixCell {
  id: string;
  producerVersion: "old" | "new";
  consumerVersion: "old" | "new";
  fault: ResilienceFaultMode;
  selected: boolean;
  exclusionReason?: string | undefined;
}

export interface ResilienceRepairEvidence {
  durableRegressionTestId?: string | undefined;
  revalidated?: boolean | undefined;
}

export interface ResilienceExperimentInput {
  id: string;
  kind: ResilienceExperimentKind;
  seed: number;
  services: ResilienceServiceVersion[];
  dependencyEdge: string;
  fault: ResilienceFaultProfile;
  cells?: ResilienceMatrixCell[] | undefined;
  retryPolicy?: { maxAttempts?: number | undefined; applicationRetriesIndefinitely?: boolean | undefined } | undefined;
  oracle: ResilienceOracle;
  implementation: ResilienceImplementation;
  bounds: ResilienceBounds;
  cleanup?: { plan?: string | undefined; recovered?: boolean | undefined } | undefined;
  repair?: ResilienceRepairEvidence | undefined;
}

export interface ResilienceCandidate {
  id: string;
  surface: string;
  sourceRef: string;
  citedEvidence: string[];
  suggestedFault: ResilienceFaultMode;
  note: string;
}

export interface ResilienceCellResult {
  cellId: string;
  status: "passed" | "failed" | "skipped" | "untested";
  detail: string;
  sideEffectCount: number;
  retryCount: number;
  recovered: boolean;
}

export interface ResilienceCoverageReport {
  selectedCount: number;
  testedCount: number;
  failedCount: number;
  untestedCount: number;
  exhaustive: false;
  limitations: string[];
}

export interface ResilienceCleanupEvidence {
  plan?: string | undefined;
  required: boolean;
  proven: false;
  recovered: boolean;
  requiredOnFailure: true;
  limitations: string[];
}

export interface ResilienceRepairTask {
  id: string;
  title: string;
  detail: string;
  durableRegressionTestId?: string | undefined;
}

export interface ResilienceSafetyReport {
  tool: "CodeDecay";
  schemaVersion: typeof RESILIENCE_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  experimentId?: string | undefined;
  experimentKind?: ResilienceExperimentKind | undefined;
  verdict: ResilienceVerdict;
  fullyVerified: false;
  bounds: ResilienceBounds;
  boundsBlocked: boolean;
  candidates: ResilienceCandidate[];
  cells: ResilienceMatrixCell[];
  coverage: ResilienceCoverageReport;
  cellResults: ResilienceCellResult[];
  cleanup: ResilienceCleanupEvidence;
  repairTasks: ResilienceRepairTask[];
  treeStatus: "unverified" | "revalidated-fixture";
  extensionBoundaries: Array<{ id: string; status: "planned"; detail: string }>;
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
  safety: {
    commandsExecuted: false;
    productionTargetAllowed: false;
    networkCalled: false;
    chaosInjected: false;
    secretsRead: false;
  };
}
