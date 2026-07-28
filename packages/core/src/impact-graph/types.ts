export const IMPACT_GRAPH_SCHEMA_VERSION = 1 as const;

export const IMPACT_GRAPH_NODE_KINDS = [
  "file",
  "route",
  "api",
  "ui",
  "product-flow",
  "symbol",
  "package",
  "persistence",
  "schema",
  "job",
  "event",
  "config",
  "env",
  "test"
] as const;

export const IMPACT_GRAPH_EDGE_KINDS = [
  "imports",
  "calls",
  "contains",
  "serves",
  "reads",
  "writes",
  "produces",
  "consumes",
  "configures",
  "tests",
  "flows-to"
] as const;

export const IMPACT_GRAPH_CONFIDENCE_LEVELS = [
  "direct",
  "inferred",
  "heuristic"
] as const;

export type ImpactGraphNodeKind = (typeof IMPACT_GRAPH_NODE_KINDS)[number];
export type ImpactGraphEdgeKind = (typeof IMPACT_GRAPH_EDGE_KINDS)[number];
export type ImpactGraphConfidence = (typeof IMPACT_GRAPH_CONFIDENCE_LEVELS)[number];
export type ImpactGraphAdapterStatus = "available" | "unavailable";

export interface ImpactGraphCapabilities {
  nodeKinds: ImpactGraphNodeKind[];
  edgeKinds: ImpactGraphEdgeKind[];
}

export interface ImpactGraphLocation {
  file: string;
  line?: number | undefined;
  column?: number | undefined;
}

export interface ImpactGraphAdapterDescriptor {
  id: string;
  version: string;
  sourceTool: string;
  sourceToolVersion?: string | undefined;
  status: ImpactGraphAdapterStatus;
  capabilities: ImpactGraphCapabilities;
  limitations: string[];
}

export interface ImpactGraphFragmentNode {
  id: string;
  kind: ImpactGraphNodeKind;
  label: string;
  location?: ImpactGraphLocation | undefined;
}

export interface ImpactGraphFragmentEdge {
  id: string;
  from: string;
  to: string;
  kind: ImpactGraphEdgeKind;
  confidence: ImpactGraphConfidence;
  evidence: string;
  sourceTool: string;
  sourceToolVersion?: string | undefined;
  location?: ImpactGraphLocation | undefined;
  limitations: string[];
}

export interface ImpactGraphFragment {
  schemaVersion: typeof IMPACT_GRAPH_SCHEMA_VERSION;
  adapter: ImpactGraphAdapterDescriptor;
  nodes: ImpactGraphFragmentNode[];
  edges: ImpactGraphFragmentEdge[];
  limitations: string[];
}

export interface ImpactGraphNode extends Omit<ImpactGraphFragmentNode, "id"> {
  id: string;
  adapterId: string;
  adapterVersion: string;
  sourceTool: string;
  sourceToolVersion?: string | undefined;
}

export interface ImpactGraphEdge extends Omit<ImpactGraphFragmentEdge, "id" | "from" | "to"> {
  id: string;
  from: string;
  to: string;
  adapterId: string;
  adapterVersion: string;
}

export type ImpactGraphAdapterSummary = ImpactGraphAdapterDescriptor;

export interface ImpactGraph {
  schemaVersion: typeof IMPACT_GRAPH_SCHEMA_VERSION;
  artifactPath?: string | undefined;
  adapters: ImpactGraphAdapterSummary[];
  nodes: ImpactGraphNode[];
  edges: ImpactGraphEdge[];
  limitations: string[];
}

export interface ImpactGraphConfidenceCounts {
  direct: number;
  inferred: number;
  heuristic: number;
}

export interface ImpactGraphSummary {
  schemaVersion: typeof IMPACT_GRAPH_SCHEMA_VERSION;
  artifactPath?: string | undefined;
  adapterCount: number;
  nodeCount: number;
  edgeCount: number;
  confidenceCounts: ImpactGraphConfidenceCounts;
  adapters: ImpactGraphAdapterSummary[];
  limitations: string[];
}

export interface UnavailableImpactGraphAdapterInput {
  adapterId: string;
  adapterVersion: string;
  sourceTool: string;
  sourceToolVersion?: string | undefined;
  capabilities: ImpactGraphCapabilities;
  limitations: string[];
}
