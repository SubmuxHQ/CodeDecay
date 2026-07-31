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

export const ENGINEERING_CONTEXT_SCHEMA_VERSION = 1 as const;

export const ENGINEERING_CONTEXT_NODE_KINDS = [
  "requirement",
  "file",
  "symbol",
  "route",
  "api",
  "package",
  "test",
  "product-flow",
  "contract",
  "ownership",
  "architecture-decision",
  "incident-regression",
  "config",
  "persistence",
  "job",
  "event",
  "verification-evidence",
  "memory"
] as const;

export const ENGINEERING_CONTEXT_EDGE_KINDS = [
  "mentions",
  "implements",
  "tests",
  "serves",
  "depends-on",
  "constrained-by",
  "documents",
  "observed-by",
  "owns",
  "relates-to"
] as const;

export const ENGINEERING_CONTEXT_CONFIDENCE_LEVELS = [
  "direct",
  "inferred",
  "heuristic"
] as const;

export const ENGINEERING_CONTEXT_TRUST_CLASSES = [
  "current-revision-fact",
  "historical-context",
  "stale-context",
  "memory",
  "ai-suggestion"
] as const;

export type EngineeringContextNodeKind = (typeof ENGINEERING_CONTEXT_NODE_KINDS)[number];
export type EngineeringContextEdgeKind = (typeof ENGINEERING_CONTEXT_EDGE_KINDS)[number];
export type EngineeringContextConfidence = (typeof ENGINEERING_CONTEXT_CONFIDENCE_LEVELS)[number];
export type EngineeringContextTrustClass = (typeof ENGINEERING_CONTEXT_TRUST_CLASSES)[number];

export type EngineeringContextProvenanceKind =
  | "git-diff"
  | "impact-graph"
  | "requirements"
  | "memory"
  | "config"
  | "document"
  | "codeowners"
  | "package-manifest"
  | "product-evidence"
  | "test-proof"
  | "tool-evidence"
  | "agent-suggestion";

export interface EngineeringContextLocation {
  file: string;
  line?: number | undefined;
  column?: number | undefined;
}

export interface EngineeringContextProvenance {
  id: string;
  kind: EngineeringContextProvenanceKind;
  source: string;
  sourceRevision: string;
  location?: EngineeringContextLocation | undefined;
  trusted: boolean;
}

export interface EngineeringContextNode {
  id: string;
  kind: EngineeringContextNodeKind;
  label: string;
  summary: string;
  searchText: string;
  sourceRevision: string;
  confidence: EngineeringContextConfidence;
  trustClass: EngineeringContextTrustClass;
  provenance: EngineeringContextProvenance[];
  location?: EngineeringContextLocation | undefined;
  limitations: string[];
  metadata?: Record<string, unknown> | undefined;
}

export interface EngineeringContextEdge {
  id: string;
  from: string;
  to: string;
  kind: EngineeringContextEdgeKind;
  summary: string;
  sourceRevision: string;
  confidence: EngineeringContextConfidence;
  trustClass: EngineeringContextTrustClass;
  provenance: EngineeringContextProvenance[];
  limitations: string[];
}

export interface EngineeringContextGraph {
  schemaVersion: typeof ENGINEERING_CONTEXT_SCHEMA_VERSION;
  artifactPath?: string | undefined;
  sourceRevision: string;
  nodes: EngineeringContextNode[];
  edges: EngineeringContextEdge[];
  limitations: string[];
}

export interface EngineeringContextSelection {
  rank: number;
  nodeId: string;
  score: number;
  matchedTerms: string[];
  reasons: string[];
  evidenceRefs: string[];
}

export interface EngineeringContextRejection {
  nodeId: string;
  score: number;
  matchedTerms: string[];
  reasons: string[];
}

export interface EngineeringTaskContext {
  tool: "CodeDecay";
  schemaVersion: typeof ENGINEERING_CONTEXT_SCHEMA_VERSION;
  generatedAt: string;
  artifactPath?: string | undefined;
  query: {
    task: string;
    tokens: string[];
    sourceRevision: string;
    maxNodes: number;
  };
  summary: {
    candidateNodes: number;
    selectedNodes: number;
    selectedEdges: number;
    rejectedDecoys: number;
    currentRevisionFacts: number;
    historicalContext: number;
    staleContext: number;
    memoryContext: number;
    aiSuggestions: number;
    limitations: string[];
  };
  graph: EngineeringContextGraph;
  selected: EngineeringContextSelection[];
  rejected: EngineeringContextRejection[];
  safety: {
    llmCalled: false;
    commandsExecuted: false;
    telemetrySent: false;
    cloudDependency: false;
    memoryTrustedAsFact: false;
  };
}

export interface EngineeringContextDocumentInput {
  path: string;
  title?: string | undefined;
  content: string;
}
