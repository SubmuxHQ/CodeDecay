export const RUNTIME_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type RuntimeEvidenceTrust = "current-revision" | "historical" | "unmatched" | "inferred";
export type RuntimeProviderKind = "local-artifact";

export interface RuntimeEvidenceSource {
  kind: "otlp-json" | "structured-errors" | "deployment-events";
  path: string;
  collectionStart?: string | undefined;
  collectionEnd?: string | undefined;
  environment?: string | undefined;
  sampled: boolean;
  redacted: true;
  limitations: string[];
}

export interface RuntimeOperationEvidence {
  evidenceId: string;
  service: string;
  operation: string;
  route?: string | undefined;
  environment?: string | undefined;
  revision?: string | undefined;
  spanCount: number;
  errorCount: number;
  maxLatencyMs: number;
  averageLatencyMs: number;
  latencyBudgetMs?: number | undefined;
  budgetBreached: boolean;
  sampled: boolean;
  trust: RuntimeEvidenceTrust;
  provesCurrentTree: false | true;
  topologyNodeIds: string[];
  downstreamServiceIds: string[];
  sourceRefs: string[];
  limitations: string[];
}

export interface RuntimeErrorEvidence {
  evidenceId: string;
  group: string;
  service: string;
  operation?: string | undefined;
  message: string;
  count: number;
  environment?: string | undefined;
  revision?: string | undefined;
  firstSeen?: string | undefined;
  lastSeen?: string | undefined;
  matchingDeploymentId?: string | undefined;
  trust: RuntimeEvidenceTrust;
  provesCurrentTree: false | true;
  sourceRef: string;
  limitations: string[];
}

export interface RuntimeDeploymentEvidence {
  evidenceId: string;
  service: string;
  revision: string;
  environment?: string | undefined;
  deployedAt?: string | undefined;
  trust: RuntimeEvidenceTrust;
  sourceRef: string;
  limitations: string[];
}

export interface RuntimeInvestigationTask {
  evidenceId: string;
  title: string;
  detail: string;
  citedEvidenceIds: string[];
  priority: "high" | "medium" | "low";
  provesCurrentTree: false;
}

export interface RuntimeProviderConfig {
  kind: RuntimeProviderKind;
  endpointOrFile?: string | undefined;
  environmentAllowlist?: string[] | undefined;
  queryBudgetMs?: number | undefined;
  secretEnvNames?: string[] | undefined;
}

export interface RuntimeEvidenceReport {
  tool: "CodeDecay";
  schemaVersion: typeof RUNTIME_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  headRevision?: string | undefined;
  provider: RuntimeProviderConfig;
  sources: RuntimeEvidenceSource[];
  operations: RuntimeOperationEvidence[];
  errors: RuntimeErrorEvidence[];
  deployments: RuntimeDeploymentEvidence[];
  investigationTasks: RuntimeInvestigationTask[];
  /** @deprecated Prefer investigationTasks; kept as title strings for older consumers. */
  investigationTaskTitles: string[];
  canProveCurrentTree: false;
  limitations: string[];
  stats: {
    spansRead: number;
    spansDroppedByBounds: number;
    malformedRecords: number;
    redactedValues: number;
  };
  safety: {
    networkCalled: false;
    commandsExecuted: false;
    telemetrySent: false;
    rawRequestBodiesPersisted: false;
    secretsPersisted: false;
  };
}
