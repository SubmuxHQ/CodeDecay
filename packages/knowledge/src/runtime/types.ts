export const RUNTIME_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type RuntimeEvidenceTrust = "current-revision" | "historical" | "unmatched" | "inferred";

export interface RuntimeEvidenceSource {
  kind: "otlp-json" | "structured-errors";
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
  sampled: boolean;
  trust: RuntimeEvidenceTrust;
  topologyNodeIds: string[];
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
  trust: RuntimeEvidenceTrust;
  sourceRef: string;
  limitations: string[];
}

export interface RuntimeEvidenceReport {
  tool: "CodeDecay";
  schemaVersion: typeof RUNTIME_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  headRevision?: string | undefined;
  sources: RuntimeEvidenceSource[];
  operations: RuntimeOperationEvidence[];
  errors: RuntimeErrorEvidence[];
  investigationTasks: string[];
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
