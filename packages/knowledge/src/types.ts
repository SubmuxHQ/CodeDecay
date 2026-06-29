export type KnowledgeArea =
  | "jwt-auth"
  | "sql"
  | "file-access"
  | "ssrf-egress"
  | "command-exec"
  | "secrets"
  | "session-cookies"
  | "deserialization"
  | "authz-access-control"
  | "cache-invalidation"
  | "timezone-dst"
  | "pagination"
  | "money-rounding"
  | "concurrency-idempotency"
  | "migration-backfill";

export interface KnowledgeEdgeCase {
  id: string;
  title: string;
  symptom: string;
  rootCause: string;
  detectionHint: string;
  fixHint: string;
  sources: string[];
}

export interface KnowledgePack {
  area: KnowledgeArea;
  title: string;
  cwe: string[];
  match: {
    impactedAreas: string[];
    fileKeywords: string[];
  };
  edgeCases: KnowledgeEdgeCase[];
}

export interface KnowledgePackMatchInput {
  impactedAreas: string[];
  changedPaths: string[];
}
