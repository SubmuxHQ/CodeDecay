import { isAbsolute, posix, win32 } from "node:path";
import {
  IMPACT_GRAPH_CONFIDENCE_LEVELS,
  IMPACT_GRAPH_EDGE_KINDS,
  IMPACT_GRAPH_NODE_KINDS,
  IMPACT_GRAPH_SCHEMA_VERSION,
  type ImpactGraph,
  type ImpactGraphAdapterDescriptor,
  type ImpactGraphCapabilities,
  type ImpactGraphConfidence,
  type ImpactGraphEdge,
  type ImpactGraphEdgeKind,
  type ImpactGraphFragment,
  type ImpactGraphFragmentEdge,
  type ImpactGraphFragmentNode,
  type ImpactGraphLocation,
  type ImpactGraphNode,
  type ImpactGraphNodeKind,
  type ImpactGraphSummary,
  type UnavailableImpactGraphAdapterInput
} from "./types";

export class ImpactGraphContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpactGraphContractError";
  }
}

export function normalizeImpactGraphFragments(fragments: ImpactGraphFragment[]): ImpactGraph {
  if (!Array.isArray(fragments)) {
    throw new ImpactGraphContractError("Impact graph fragments must be an array.");
  }
  for (const fragment of fragments) {
    validateFragmentHeader(fragment);
  }

  const sortedFragments = [...fragments].sort(compareFragments);
  const adapterIds = new Set<string>();
  const nodes: ImpactGraphNode[] = [];
  const edges: ImpactGraphEdge[] = [];
  const limitations: string[] = [];

  for (const fragment of sortedFragments) {
    if (adapterIds.has(fragment.adapter.id)) {
      throw new ImpactGraphContractError(
        `Duplicate impact adapter id "${fragment.adapter.id}". Each normalized fragment must have a unique adapter id.`
      );
    }
    adapterIds.add(fragment.adapter.id);

    const localNodeIds = new Set<string>();
    for (const node of fragment.nodes) {
      validateNode(node, fragment.adapter);
      if (localNodeIds.has(node.id)) {
        throw new ImpactGraphContractError(
          `Duplicate node id "${node.id}" in impact adapter "${fragment.adapter.id}".`
        );
      }
      localNodeIds.add(node.id);
      nodes.push(normalizeNode(node, fragment.adapter));
    }

    const localEdgeIds = new Set<string>();
    for (const edge of fragment.edges) {
      validateEdge(edge, fragment.adapter, localNodeIds);
      if (localEdgeIds.has(edge.id)) {
        throw new ImpactGraphContractError(
          `Duplicate edge id "${edge.id}" in impact adapter "${fragment.adapter.id}".`
        );
      }
      localEdgeIds.add(edge.id);
      edges.push(normalizeEdge(edge, fragment.adapter));
    }

    limitations.push(...fragment.adapter.limitations, ...fragment.limitations);
    for (const edge of fragment.edges) {
      limitations.push(...edge.limitations);
    }
  }

  return {
    schemaVersion: IMPACT_GRAPH_SCHEMA_VERSION,
    adapters: sortedFragments.map((fragment) => normalizeAdapter(fragment.adapter, fragment.limitations)),
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    limitations: uniqueSorted(limitations)
  };
}

export function summarizeImpactGraph(graph: ImpactGraph): ImpactGraphSummary {
  const confidenceCounts = {
    direct: 0,
    inferred: 0,
    heuristic: 0
  };
  for (const edge of graph.edges) {
    confidenceCounts[edge.confidence] += 1;
  }

  return {
    schemaVersion: graph.schemaVersion,
    artifactPath: graph.artifactPath,
    adapterCount: graph.adapters.length,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    confidenceCounts,
    adapters: graph.adapters.map(cloneAdapter),
    limitations: [...graph.limitations]
  };
}

export function createUnavailableImpactGraphFragment(
  input: UnavailableImpactGraphAdapterInput
): ImpactGraphFragment {
  if (input.limitations.length === 0) {
    throw new ImpactGraphContractError(
      `Unavailable impact adapter "${input.adapterId}" must explain at least one limitation.`
    );
  }

  return {
    schemaVersion: IMPACT_GRAPH_SCHEMA_VERSION,
    adapter: {
      id: input.adapterId,
      version: input.adapterVersion,
      sourceTool: input.sourceTool,
      sourceToolVersion: input.sourceToolVersion,
      status: "unavailable",
      capabilities: cloneCapabilities(input.capabilities),
      limitations: uniqueSorted(input.limitations)
    },
    nodes: [],
    edges: [],
    limitations: uniqueSorted(input.limitations)
  };
}

function validateFragmentHeader(fragment: ImpactGraphFragment): void {
  if (!fragment || typeof fragment !== "object") {
    throw new ImpactGraphContractError("Each impact graph fragment must be an object.");
  }
  if (fragment.schemaVersion !== IMPACT_GRAPH_SCHEMA_VERSION) {
    throw new ImpactGraphContractError(
      `Unsupported impact graph schema version "${String(fragment.schemaVersion)}"; expected ${IMPACT_GRAPH_SCHEMA_VERSION}.`
    );
  }
  if (!fragment.adapter || typeof fragment.adapter !== "object") {
    throw new ImpactGraphContractError("Each impact graph fragment must provide an adapter descriptor.");
  }
  validateAdapter(fragment.adapter);

  if (!Array.isArray(fragment.nodes) || !Array.isArray(fragment.edges) || !Array.isArray(fragment.limitations)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${fragment.adapter.id}" must provide node, edge, and limitation arrays.`
    );
  }

  if (
    fragment.adapter.status === "unavailable" &&
    (fragment.nodes.length > 0 || fragment.edges.length > 0)
  ) {
    throw new ImpactGraphContractError(
      `Unavailable impact adapter "${fragment.adapter.id}" cannot contribute nodes or edges.`
    );
  }
  if (fragment.adapter.status === "unavailable" && fragment.adapter.limitations.length === 0) {
    throw new ImpactGraphContractError(
      `Unavailable impact adapter "${fragment.adapter.id}" must explain at least one limitation.`
    );
  }
}

function validateAdapter(adapter: ImpactGraphAdapterDescriptor): void {
  requireText(adapter.id, "Impact adapter id");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(adapter.id)) {
    throw new ImpactGraphContractError(
      `Impact adapter id "${adapter.id}" must use lowercase letters, digits, dots, underscores, or hyphens.`
    );
  }
  requireText(adapter.version, `Impact adapter "${adapter.id}" version`);
  requireText(adapter.sourceTool, `Impact adapter "${adapter.id}" source tool`);
  if (adapter.sourceToolVersion !== undefined) {
    requireText(adapter.sourceToolVersion, `Impact adapter "${adapter.id}" source tool version`);
  }
  if (adapter.status !== "available" && adapter.status !== "unavailable") {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" has unsupported status "${String(adapter.status)}".`
    );
  }
  validateCapabilities(adapter.capabilities, adapter.id);
  validateStringArray(adapter.limitations, `Impact adapter "${adapter.id}" limitations`);
}

function validateCapabilities(capabilities: ImpactGraphCapabilities, adapterId: string): void {
  if (!Array.isArray(capabilities?.nodeKinds) || !Array.isArray(capabilities?.edgeKinds)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapterId}" must declare node and edge capabilities.`
    );
  }
  for (const kind of capabilities.nodeKinds) {
    if (!isNodeKind(kind)) {
      throw new ImpactGraphContractError(
        `Impact adapter "${adapterId}" declares unknown node kind "${String(kind)}".`
      );
    }
  }
  for (const kind of capabilities.edgeKinds) {
    if (!isEdgeKind(kind)) {
      throw new ImpactGraphContractError(
        `Impact adapter "${adapterId}" declares unknown edge kind "${String(kind)}".`
      );
    }
  }
}

function validateNode(node: ImpactGraphFragmentNode, adapter: ImpactGraphAdapterDescriptor): void {
  if (!node || typeof node !== "object") {
    throw new ImpactGraphContractError(`Impact adapter "${adapter.id}" nodes must be objects.`);
  }
  requireLocalId(node.id, "node", adapter.id);
  if (!isNodeKind(node.kind)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" node "${node.id}" has unknown kind "${String(node.kind)}".`
    );
  }
  if (!adapter.capabilities.nodeKinds.includes(node.kind)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" does not declare node kind "${node.kind}" used by node "${node.id}".`
    );
  }
  requireText(node.label, `Impact adapter "${adapter.id}" node "${node.id}" label`);
  if (node.location) {
    validateLocation(node.location, `Impact adapter "${adapter.id}" node "${node.id}"`);
  }
}

function validateEdge(
  edge: ImpactGraphFragmentEdge,
  adapter: ImpactGraphAdapterDescriptor,
  localNodeIds: Set<string>
): void {
  if (!edge || typeof edge !== "object") {
    throw new ImpactGraphContractError(`Impact adapter "${adapter.id}" edges must be objects.`);
  }
  requireLocalId(edge.id, "edge", adapter.id);
  if (!localNodeIds.has(edge.to)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" edge "${edge.id}" references unknown node "${edge.from}".`
    );
  }
  if (!localNodeIds.has(edge.from)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" edge "${edge.id}" references unknown node "${edge.to}".`
    );
  }
  if (!isEdgeKind(edge.kind)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" edge "${edge.id}" has unknown kind "${String(edge.kind)}".`
    );
  }
  if (!adapter.capabilities.edgeKinds.includes(edge.kind)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" does not declare edge kind "${edge.kind}" used by edge "${edge.id}".`
    );
  }
  if (!isConfidence(edge.confidence)) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapter.id}" edge "${edge.id}" has unknown confidence "${String(edge.confidence)}".`
    );
  }
  requireText(edge.evidence, `Impact adapter "${adapter.id}" edge "${edge.id}" evidence`);
  requireText(edge.sourceTool, `Impact adapter "${adapter.id}" edge "${edge.id}" source tool`);
  if (edge.sourceToolVersion !== undefined) {
    requireText(
      edge.sourceToolVersion,
      `Impact adapter "${adapter.id}" edge "${edge.id}" source tool version`
    );
  }
  validateStringArray(edge.limitations, `Impact adapter "${adapter.id}" edge "${edge.id}" limitations`);
  if (edge.location) {
    validateLocation(edge.location, `Impact adapter "${adapter.id}" edge "${edge.id}"`);
  }
}

function validateLocation(location: ImpactGraphLocation, owner: string): void {
  if (!location || typeof location !== "object" || typeof location.file !== "string") {
    throw new ImpactGraphContractError(`${owner} location must use a relative repository path.`);
  }
  const normalized = location.file.replaceAll("\\", "/");
  const canonical = posix.normalize(normalized);
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    isAbsolute(location.file) ||
    win32.isAbsolute(location.file) ||
    canonical === "." ||
    canonical === ".." ||
    canonical.startsWith("../")
  ) {
    throw new ImpactGraphContractError(
      `${owner} location must use a relative repository path; received "${location.file}".`
    );
  }
  if (
    location.line !== undefined &&
    (!Number.isInteger(location.line) || location.line < 1)
  ) {
    throw new ImpactGraphContractError(`${owner} location line must be a positive integer.`);
  }
  if (
    location.column !== undefined &&
    (!Number.isInteger(location.column) || location.column < 0)
  ) {
    throw new ImpactGraphContractError(`${owner} location column must be a non-negative integer.`);
  }
}

function normalizeNode(
  node: ImpactGraphFragmentNode,
  adapter: ImpactGraphAdapterDescriptor
): ImpactGraphNode {
  return {
    id: namespaceId(adapter.id, node.id),
    kind: node.kind,
    label: node.label.trim(),
    location: node.location ? normalizeLocation(node.location) : undefined,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    sourceTool: adapter.sourceTool,
    sourceToolVersion: adapter.sourceToolVersion
  };
}

function normalizeEdge(
  edge: ImpactGraphFragmentEdge,
  adapter: ImpactGraphAdapterDescriptor
): ImpactGraphEdge {
  return {
    id: namespaceId(adapter.id, edge.id),
    from: namespaceId(adapter.id, edge.from),
    to: namespaceId(adapter.id, edge.to),
    kind: edge.kind,
    confidence: edge.confidence,
    evidence: edge.evidence.trim(),
    sourceTool: edge.sourceTool.trim(),
    sourceToolVersion: edge.sourceToolVersion,
    location: edge.location ? normalizeLocation(edge.location) : undefined,
    limitations: uniqueSorted(edge.limitations),
    adapterId: adapter.id,
    adapterVersion: adapter.version
  };
}

function normalizeAdapter(
  adapter: ImpactGraphAdapterDescriptor,
  fragmentLimitations: string[]
): ImpactGraphAdapterDescriptor {
  return {
    id: adapter.id,
    version: adapter.version.trim(),
    sourceTool: adapter.sourceTool.trim(),
    sourceToolVersion: adapter.sourceToolVersion?.trim(),
    status: adapter.status,
    capabilities: cloneCapabilities(adapter.capabilities),
    limitations: uniqueSorted([...adapter.limitations, ...fragmentLimitations])
  };
}

function cloneAdapter(adapter: ImpactGraphAdapterDescriptor): ImpactGraphAdapterDescriptor {
  return {
    ...adapter,
    capabilities: cloneCapabilities(adapter.capabilities),
    limitations: [...adapter.limitations]
  };
}

function cloneCapabilities(capabilities: ImpactGraphCapabilities): ImpactGraphCapabilities {
  return {
    nodeKinds: uniqueSorted(capabilities.nodeKinds),
    edgeKinds: uniqueSorted(capabilities.edgeKinds)
  };
}

function normalizeLocation(location: ImpactGraphLocation): ImpactGraphLocation {
  return {
    file: posix.normalize(location.file.replaceAll("\\", "/")),
    line: location.line,
    column: location.column
  };
}

function requireLocalId(value: string, kind: "node" | "edge", adapterId: string): void {
  requireText(value, `Impact adapter "${adapterId}" ${kind} id`);
  if (value.includes("\0")) {
    throw new ImpactGraphContractError(
      `Impact adapter "${adapterId}" ${kind} id cannot contain null bytes.`
    );
  }
}

function requireText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ImpactGraphContractError(`${name} must be a non-empty string.`);
  }
}

function validateStringArray(values: string[], name: string): void {
  if (!Array.isArray(values)) {
    throw new ImpactGraphContractError(`${name} must be an array.`);
  }
  for (const value of values) {
    requireText(value, `${name} entry`);
  }
}

function namespaceId(adapterId: string, localId: string): string {
  return `${adapterId}::${localId}`;
}

function compareFragments(left: ImpactGraphFragment, right: ImpactGraphFragment): number {
  const idCompare = left.adapter.id.localeCompare(right.adapter.id);
  return idCompare === 0 ? left.adapter.version.localeCompare(right.adapter.version) : idCompare;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isNodeKind(value: unknown): value is ImpactGraphNodeKind {
  return (IMPACT_GRAPH_NODE_KINDS as readonly unknown[]).includes(value);
}

function isEdgeKind(value: unknown): value is ImpactGraphEdgeKind {
  return (IMPACT_GRAPH_EDGE_KINDS as readonly unknown[]).includes(value);
}

function isConfidence(value: unknown): value is ImpactGraphConfidence {
  return (IMPACT_GRAPH_CONFIDENCE_LEVELS as readonly unknown[]).includes(value);
}
