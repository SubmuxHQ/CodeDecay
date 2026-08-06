export const MIGRATION_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type MigrationRisk = "info" | "needs-proof" | "blocker";
export type MigrationTargetKind = "unspecified" | "disposable-local" | "remote-unapproved" | "production-like";
export type MigrationVerdict = "plan-ready" | "plan-blocked" | "needs-execution-proof" | "not-fully-verified";
export type MigrationRollbackStatus = "missing" | "planned" | "failed" | "unproven";
export type MigrationOperationKind =
  | "create-object"
  | "drop-object"
  | "add-column"
  | "drop-column"
  | "rename-column"
  | "rename-object"
  | "alter-column"
  | "create-index"
  | "backfill"
  | "other";

export interface MigrationOperationEvidence {
  evidenceId: string;
  kind: MigrationOperationKind;
  object: string;
  detail: string;
  sourceRef: string;
  risk: MigrationRisk;
  destructive: boolean;
  lockRisk: "low" | "unknown" | "high";
  requiresBackfill: boolean;
  rollbackSupported: boolean | "unknown";
  limitations: string[];
}

export interface MigrationMatrixState {
  state: "old-app-old-schema" | "old-app-new-schema" | "new-app-old-schema" | "new-app-new-schema" | "rollback";
  status: "baseline" | "needs-proof" | "blocked" | "failed";
  evidenceIds: string[];
  reason: string;
  verificationTask?: string | undefined;
}

export interface MigrationConnectionTarget {
  kind: MigrationTargetKind;
  host?: string | undefined;
  redacted: string;
  blocked: boolean;
  reasons: string[];
}

export interface MigrationCleanupEvidence {
  plan?: string | undefined;
  required: boolean;
  proven: false;
  requiredOnFailure: true;
  limitations: string[];
}

export interface MigrationSafetyReport {
  tool: "CodeDecay";
  schemaVersion: typeof MIGRATION_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  dialect: "postgresql";
  targetKind: MigrationTargetKind;
  verdict: MigrationVerdict;
  fullyVerified: false;
  rollbackStatus: MigrationRollbackStatus;
  connectionTarget?: MigrationConnectionTarget | undefined;
  cleanup: MigrationCleanupEvidence;
  sourceFiles: string[];
  rollbackFiles: string[];
  operations: MigrationOperationEvidence[];
  matrix: MigrationMatrixState[];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
  safety: {
    commandsExecuted: false;
    databaseConnected: false;
    migrationApplied: false;
    secretsRead: false;
    productionTargetAllowed: false;
  };
}
