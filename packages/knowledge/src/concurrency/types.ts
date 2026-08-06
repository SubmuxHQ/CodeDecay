export const CONCURRENCY_EVIDENCE_SCHEMA_VERSION = 1 as const;

export const CONCURRENCY_DEFAULT_BOUNDS = {
  maxParallelism: 8,
  repetitions: 50,
  timeoutMs: 30_000
} as const;

export type ConcurrencyTargetKind =
  | "unspecified"
  | "fixture-local"
  | "disposable-local"
  | "remote-unapproved"
  | "production-like";

export type ConcurrencyExperimentKind = "deterministic-schedule" | "probabilistic-stress";

export type ConcurrencyInvariant =
  | "exactly-once-effect"
  | "at-least-once-safe"
  | "no-lost-update"
  | "monotonic-state"
  | "bounded-retries"
  | "compensating-action";

export type ConcurrencyImplementationMode =
  | "non-idempotent"
  | "idempotent"
  | "lost-update"
  | "versioned-update";

export type ConcurrencyVerdict =
  | "confirmed-race"
  | "passed-oracle"
  | "flaky-suspicion"
  | "inconclusive-stress"
  | "environment-failure"
  | "unsupported-scheduler"
  | "bounds-blocked"
  | "needs-human"
  | "plan-ready";

export type ConcurrencyCandidateKind =
  | "route"
  | "job"
  | "webhook"
  | "transaction"
  | "lock"
  | "idempotency-key"
  | "retry"
  | "outbox"
  | "cron";

export interface ConcurrencyBounds {
  maxParallelism: number;
  repetitions: number;
  timeoutMs: number;
  targetKind: ConcurrencyTargetKind;
  networkTarget?: string | undefined;
}

export interface ConcurrencyScheduleStep {
  at: number;
  operationId: string;
  actor: string;
  barrier?: string | undefined;
}

export interface ConcurrencyOperation {
  id: string;
  type: "deliver-message" | "http-mutate" | "read-modify-write" | "retry";
  payloadKey: string;
  amount?: number | undefined;
}

export interface ConcurrencyStateOracle {
  invariant: ConcurrencyInvariant;
  expectedSideEffects?: number | undefined;
  expectedFinalValue?: number | undefined;
}

export interface ConcurrencyRepairEvidence {
  durableRegressionTestId?: string | undefined;
  revalidated?: boolean | undefined;
}

export interface ConcurrencyExperimentInput {
  id: string;
  kind: ConcurrencyExperimentKind;
  actors: string[];
  operations: ConcurrencyOperation[];
  schedule: {
    seed: number;
    steps: ConcurrencyScheduleStep[];
  };
  retryPolicy?: {
    maxAttempts?: number | undefined;
    duplicateDelivery?: boolean | undefined;
  } | undefined;
  faultPoints?: string[] | undefined;
  stateOracle: ConcurrencyStateOracle;
  implementation: {
    mode: ConcurrencyImplementationMode;
  };
  bounds: ConcurrencyBounds;
  cleanup?: {
    plan?: string | undefined;
  } | undefined;
  repair?: ConcurrencyRepairEvidence | undefined;
}

export interface ConcurrencyCandidate {
  id: string;
  kind: ConcurrencyCandidateKind;
  surface: string;
  sourceRef: string;
  citedEvidence: string[];
  suggestedInvariant: ConcurrencyInvariant;
  note: string;
}

export interface ConcurrencyTimelineEvent {
  at: number;
  actor: string;
  operationId: string;
  attemptId: string;
  barrier?: string | undefined;
  sideEffectDelta: number;
  stateBefore: number;
  stateAfter: number;
}

export interface ConcurrencyOracleResult {
  verdict: ConcurrencyVerdict;
  sideEffectCount: number;
  finalState: number;
  attemptIds: string[];
  timeline: ConcurrencyTimelineEvent[];
  failures: string[];
  seed: number;
  repetitions: number;
  toolVersion: string;
}

export interface ConcurrencyCleanupEvidence {
  plan?: string | undefined;
  required: boolean;
  proven: false;
  requiredOnFailure: true;
  limitations: string[];
}

export interface ConcurrencyRepairTask {
  id: string;
  title: string;
  detail: string;
  durableRegressionTestId?: string | undefined;
}

export interface ConcurrencyExtensionBoundary {
  id: string;
  status: "planned";
  detail: string;
}

export interface ConcurrencySafetyReport {
  tool: "CodeDecay";
  schemaVersion: typeof CONCURRENCY_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  experimentId?: string | undefined;
  experimentKind?: ConcurrencyExperimentKind | undefined;
  verdict: ConcurrencyVerdict;
  fullyVerified: false;
  invariant?: ConcurrencyInvariant | undefined;
  bounds: ConcurrencyBounds;
  boundsBlocked: boolean;
  candidates: ConcurrencyCandidate[];
  oracle?: ConcurrencyOracleResult | undefined;
  cleanup: ConcurrencyCleanupEvidence;
  repairTasks: ConcurrencyRepairTask[];
  treeStatus: "unverified" | "revalidated-fixture";
  extensionBoundaries: ConcurrencyExtensionBoundary[];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
  safety: {
    commandsExecuted: false;
    productionTargetAllowed: false;
    networkCalled: false;
    schedulerSpawned: false;
    secretsRead: false;
  };
}
