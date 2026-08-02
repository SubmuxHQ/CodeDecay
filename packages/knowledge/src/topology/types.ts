export const SERVICE_TOPOLOGY_SCHEMA_VERSION = 1 as const;

export const SERVICE_TOPOLOGY_NODE_KINDS = [
  "repository",
  "package",
  "service",
  "deployment-unit",
  "api",
  "event-topic",
  "schema",
  "datastore",
  "job",
  "environment",
  "team"
] as const;

export const SERVICE_TOPOLOGY_EDGE_KINDS = [
  "produces",
  "consumes",
  "calls",
  "publishes",
  "subscribes",
  "reads",
  "writes",
  "deploys-with",
  "owns",
  "versioned-by",
  "compatibility-requires",
  "contains"
] as const;

export type ServiceTopologyNodeKind = (typeof SERVICE_TOPOLOGY_NODE_KINDS)[number];
export type ServiceTopologyEdgeKind = (typeof SERVICE_TOPOLOGY_EDGE_KINDS)[number];
export type ServiceTopologyConfidence = "verified" | "declared" | "inferred";
export type ServiceTopologyFreshness = "current" | "stale" | "unknown";
export type ServiceTopologyTrustClass = "current-revision-fact" | "declared-context" | "untrusted-inference" | "stale-context";

export interface ServiceTopologySource {
  kind: "manifest" | "openapi" | "asyncapi" | "protobuf" | "package-manager" | "service-catalog" | "local-graph";
  source: string;
  repositoryId: string;
  revision: string;
  observedAt?: string | undefined;
}

export interface ServiceTopologyNode {
  id: string;
  kind: ServiceTopologyNodeKind;
  label: string;
  repositoryId?: string | undefined;
  repositoryRoot?: string | undefined;
  available?: boolean | undefined;
  confidence: ServiceTopologyConfidence;
  freshness: ServiceTopologyFreshness;
  trustClass: ServiceTopologyTrustClass;
  sources: ServiceTopologySource[];
  limitations: string[];
  metadata?: Record<string, unknown> | undefined;
}

export interface ServiceTopologyEdge {
  id: string;
  from: string;
  to: string;
  kind: ServiceTopologyEdgeKind;
  confidence: ServiceTopologyConfidence;
  freshness: ServiceTopologyFreshness;
  trustClass: ServiceTopologyTrustClass;
  sources: ServiceTopologySource[];
  limitations: string[];
}

export interface ServiceTopologyGraph {
  schemaVersion: typeof SERVICE_TOPOLOGY_SCHEMA_VERSION;
  generatedAt?: string | undefined;
  nodes: ServiceTopologyNode[];
  edges: ServiceTopologyEdge[];
  limitations: string[];
}

export interface ServiceTopologyImpact {
  evidenceId: string;
  changedNodeId: string;
  dependencyNodeId: string;
  repositoryId?: string | undefined;
  deploymentUnitIds: string[];
  ownerTeamIds: string[];
  relationship: ServiceTopologyEdgeKind;
  proof: "verified" | "declared" | "untrusted";
  freshness: ServiceTopologyFreshness;
  requiredChecks: string[];
  limitations: string[];
}

export interface ServiceTopologyGap {
  evidenceId: string;
  nodeId: string;
  repositoryId?: string | undefined;
  reason: "unavailable-repository" | "stale-dependency" | "unresolved-consumer" | "inferred-dependency";
  verificationTask: string;
}

export interface ServiceTopologyImpactReport {
  tool: "CodeDecay";
  schemaVersion: typeof SERVICE_TOPOLOGY_SCHEMA_VERSION;
  changedNodeIds: string[];
  impacts: ServiceTopologyImpact[];
  gaps: ServiceTopologyGap[];
  safety: {
    repositoriesCloned: false;
    networkCalled: false;
    commandsExecuted: false;
    telemetrySent: false;
    inferredRiskTrusted: false;
  };
}
