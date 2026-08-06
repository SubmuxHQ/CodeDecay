import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadServiceTopologyManifest,
  normalizeServiceTopologyGraph,
  persistServiceTopologyArtifact,
  SERVICE_TOPOLOGY_ARTIFACT_PATH,
  topologyEvidenceId
} from "./manifest";
import { analyzeServiceTopologyImpact, renderServiceTopologyImpactMarkdown } from "./impact";
import { parseOpenApiTopology } from "./contracts/openapi";
import { parseAsyncApiTopology } from "./contracts/asyncapi";
import type {
  ServiceTopologyEdge,
  ServiceTopologyGraph,
  ServiceTopologyImpactReport,
  ServiceTopologyNode
} from "./types";
import { SERVICE_TOPOLOGY_SCHEMA_VERSION } from "./types";
import { resolveGitSourceRevision } from "../context";

export interface BuildServiceTopologyOptions {
  rootDir: string;
  manifest?: string | undefined;
  openapi?: string[] | undefined;
  asyncapi?: string[] | undefined;
  localGraph?: string | undefined;
  repositoryId?: string | undefined;
  revision?: string | undefined;
  producerServiceId?: string | undefined;
  publisherServiceId?: string | undefined;
  subscriberServiceId?: string | undefined;
  invalidatePaths?: string[] | undefined;
  changedNodeIds?: string[] | undefined;
  now?: Date | undefined;
  persist?: boolean | undefined;
}

export interface ServiceTopologyReport {
  tool: "CodeDecay";
  schemaVersion: typeof SERVICE_TOPOLOGY_SCHEMA_VERSION;
  graph: ServiceTopologyGraph;
  impact: ServiceTopologyImpactReport;
  agentTasks: ServiceTopologyAgentTask[];
  artifactPath?: string | undefined;
  invalidatedPaths: string[];
  adapters: Array<"manifest" | "openapi" | "asyncapi" | "local-graph">;
  safety: ServiceTopologyImpactReport["safety"];
}

export interface ServiceTopologyAgentTask {
  evidenceId: string;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  ownerTeamIds: string[];
  repositoryId?: string | undefined;
}

export function buildServiceTopologyReport(options: BuildServiceTopologyOptions): ServiceTopologyReport {
  const rootDir = realpathSync(options.rootDir);
  const revision = options.revision ?? resolveGitSourceRevision(rootDir);
  const repositoryId = options.repositoryId ?? `repo:${hashShort(rootDir)}`;
  const now = options.now ?? new Date();
  const invalidatedPaths = [...new Set((options.invalidatePaths ?? []).map(normalizePath))].sort();
  const adapters: ServiceTopologyReport["adapters"] = [];
  const parts: ServiceTopologyGraph[] = [];
  const previous = invalidatedPaths.length > 0 ? loadPersistedTopology(rootDir) : undefined;

  if (previous && invalidatedPaths.length > 0) {
    parts.push(stripSources(previous, invalidatedPaths));
  }

  if (options.manifest && (invalidatedPaths.length === 0 || invalidatedPaths.includes(normalizePath(options.manifest)) || !previous)) {
    adapters.push("manifest");
    parts.push(loadServiceTopologyManifest({ rootDir, path: options.manifest, now }));
  } else if (options.manifest) {
    adapters.push("manifest");
  }

  for (const path of options.openapi ?? []) {
    if (invalidatedPaths.length > 0 && previous && !invalidatedPaths.includes(normalizePath(path))) {
      adapters.push("openapi");
      continue;
    }
    adapters.push("openapi");
    parts.push(
      parseOpenApiTopology({
        rootDir,
        path,
        repositoryId,
        revision,
        now,
        producerServiceId: options.producerServiceId
      })
    );
  }

  for (const path of options.asyncapi ?? []) {
    if (invalidatedPaths.length > 0 && previous && !invalidatedPaths.includes(normalizePath(path))) {
      adapters.push("asyncapi");
      continue;
    }
    adapters.push("asyncapi");
    parts.push(
      parseAsyncApiTopology({
        rootDir,
        path,
        repositoryId,
        revision,
        now,
        publisherServiceId: options.publisherServiceId,
        subscriberServiceId: options.subscriberServiceId
      })
    );
  }

  if (options.localGraph) {
    if (!(invalidatedPaths.length > 0 && previous && !invalidatedPaths.includes(normalizePath(options.localGraph)))) {
      adapters.push("local-graph");
      parts.push(loadLocalGraphTopology({
        rootDir,
        path: options.localGraph,
        repositoryId,
        revision,
        now
      }));
    } else {
      adapters.push("local-graph");
    }
  }

  if (parts.length === 0) {
    throw new Error("topology requires --manifest, --openapi, --asyncapi, and/or --local-graph.");
  }

  const graph = mergeTopologyGraphs(parts, now);
  const changedNodeIds = options.changedNodeIds?.length
    ? options.changedNodeIds
    : inferChangedNodes(graph, invalidatedPaths);
  const impact = analyzeServiceTopologyImpact(graph, changedNodeIds);
  const agentTasks = createTopologyAgentTasks(impact);
  const artifactPath = options.persist === false ? undefined : persistServiceTopologyArtifact(rootDir, graph);

  return {
    tool: "CodeDecay",
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    graph,
    impact,
    agentTasks,
    artifactPath,
    invalidatedPaths,
    adapters: [...new Set(adapters)],
    safety: impact.safety
  };
}

export function renderServiceTopologyReportMarkdown(report: ServiceTopologyReport): string {
  const lines = [
    "## CodeDecay Service Topology",
    "",
    `**Adapters:** ${report.adapters.join(", ") || "none"}`,
    `**Nodes:** ${report.graph.nodes.length}`,
    `**Edges:** ${report.graph.edges.length}`,
    `**Invalidated paths:** ${report.invalidatedPaths.map((path) => `\`${path}\``).join(", ") || "none"}`,
    report.artifactPath ? `**Artifact:** \`${report.artifactPath}\`` : "**Artifact:** not persisted",
    "",
    "### Graph Limitations",
    ""
  ];
  for (const limitation of report.graph.limitations) lines.push(`- ${limitation}`);
  lines.push("", renderServiceTopologyImpactMarkdown(report.impact).trimEnd(), "", "### Agent Tasks", "");
  if (report.agentTasks.length === 0) {
    lines.push("No cross-repository agent tasks were generated.");
  } else {
    for (const task of report.agentTasks) {
      lines.push(
        `- **${task.title}** (${task.priority}) \`${task.evidenceId}\``,
        `  - ${task.detail}`,
        `  - Owners: ${task.ownerTeamIds.map((id) => `\`${id}\``).join(", ") || "none declared"}`,
        `  - Repository: \`${task.repositoryId ?? "unresolved"}\``
      );
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function createTopologyAgentTasks(impact: ServiceTopologyImpactReport): ServiceTopologyAgentTask[] {
  const tasks: ServiceTopologyAgentTask[] = [];
  for (const item of impact.impacts) {
    tasks.push({
      evidenceId: item.evidenceId,
      title: `Verify ${item.dependencyNodeId} against ${item.changedNodeId}`,
      detail: item.requiredChecks.join(" "),
      priority: item.proof === "untrusted" || item.freshness !== "current" ? "high" : "medium",
      ownerTeamIds: item.ownerTeamIds,
      repositoryId: item.repositoryId
    });
  }
  for (const gap of impact.gaps) {
    tasks.push({
      evidenceId: gap.evidenceId,
      title: `Close topology gap: ${gap.reason}`,
      detail: gap.verificationTask,
      priority: "high",
      ownerTeamIds: [],
      repositoryId: gap.repositoryId
    });
  }
  return uniqueBy(tasks, (task) => task.evidenceId).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function mergeTopologyGraphs(parts: ServiceTopologyGraph[], now = new Date()): ServiceTopologyGraph {
  const nodes = new Map<string, ServiceTopologyNode>();
  const edges = new Map<string, ServiceTopologyEdge>();
  const limitations = new Set<string>([
    "Merged local topology is inspectable and never clones remote repositories or trusts inferred edges alone."
  ]);
  for (const part of parts) {
    for (const limitation of part.limitations) limitations.add(limitation);
    for (const node of part.nodes) nodes.set(node.id, node);
    for (const edge of part.edges) edges.set(edge.id, edge);
  }
  return normalizeServiceTopologyGraph({
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    limitations: [...limitations].sort()
  }, { now });
}

function loadPersistedTopology(rootDir: string): ServiceTopologyGraph | undefined {
  const path = resolve(rootDir, SERVICE_TOPOLOGY_ARTIFACT_PATH);
  if (!existsSync(path)) return undefined;
  try {
    return normalizeServiceTopologyGraph(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

function stripSources(graph: ServiceTopologyGraph, invalidatedPaths: string[]): ServiceTopologyGraph {
  const invalidated = new Set(invalidatedPaths);
  const nodes = graph.nodes.filter((node) => !nodeTouchesInvalidated(node, invalidated));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) =>
      nodeIds.has(edge.from) &&
      nodeIds.has(edge.to) &&
      !edge.sources.some((source) => invalidated.has(normalizePath(source.source)))
  );
  return {
    ...graph,
    nodes,
    edges,
    limitations: [
      ...graph.limitations,
      "Incremental topology update retained unaffected nodes/edges and rewrote only invalidated contract sources."
    ]
  };
}

function nodeTouchesInvalidated(node: ServiceTopologyNode, invalidated: Set<string>): boolean {
  if (node.sources.some((source) => invalidated.has(normalizePath(source.source)))) return true;
  const openapiPath = node.metadata?.openapiPath;
  const asyncapiPath = node.metadata?.asyncapiPath;
  return (
    (typeof openapiPath === "string" && invalidated.has(normalizePath(openapiPath))) ||
    (typeof asyncapiPath === "string" && invalidated.has(normalizePath(asyncapiPath)))
  );
}

function loadLocalGraphTopology(input: {
  rootDir: string;
  path: string;
  repositoryId: string;
  revision: string;
  now: Date;
}): ServiceTopologyGraph {
  const absolute = resolve(input.rootDir, input.path);
  if (!absolute.startsWith(`${input.rootDir}/`) || !existsSync(absolute)) {
    throw new Error(`Local graph artifact not found inside repository: ${input.path}`);
  }
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as {
    nodes?: Array<{ id?: string; kind?: string; label?: string; location?: { file?: string } }>;
  };
  const observedAt = input.now.toISOString();
  const source = {
    kind: "local-graph" as const,
    source: input.path,
    repositoryId: input.repositoryId,
    revision: input.revision,
    observedAt
  };
  const repoNodeId = `repository:${input.repositoryId}`;
  const nodes: ServiceTopologyNode[] = [
    {
      id: repoNodeId,
      kind: "repository",
      label: input.repositoryId,
      repositoryId: input.repositoryId,
      repositoryRoot: input.rootDir,
      available: true,
      confidence: "declared",
      freshness: "current",
      trustClass: "declared-context",
      sources: [source],
      limitations: ["Repository node linked from local engineering/impact graph evidence."]
    }
  ];
  const edges: ServiceTopologyEdge[] = [];
  for (const node of parsed.nodes ?? []) {
    if (!node.id) continue;
    const kind = mapLocalKind(node.kind);
    if (!kind) continue;
    const topologyNodeId = `local:${node.id}`;
    nodes.push({
      id: topologyNodeId,
      kind,
      label: node.label ?? node.id,
      repositoryId: input.repositoryId,
      confidence: "declared",
      freshness: "current",
      trustClass: "declared-context",
      sources: [source],
      limitations: ["Linked from repository-local graph evidence; not a remote service discovery result."],
      metadata: { localGraphNodeId: node.id, file: node.location?.file }
    });
    edges.push({
      id: topologyEvidenceId(["contains", repoNodeId, topologyNodeId]),
      from: repoNodeId,
      to: topologyNodeId,
      kind: "contains",
      confidence: "declared",
      freshness: "current",
      trustClass: "declared-context",
      sources: [source],
      limitations: []
    });
  }
  return {
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    generatedAt: observedAt,
    nodes,
    edges,
    limitations: ["Local-graph adapter connects repository-local evidence (#676) into service topology without network access."]
  };
}

function mapLocalKind(kind: string | undefined): ServiceTopologyNode["kind"] | undefined {
  switch (kind) {
    case "api":
    case "route":
    case "endpoint":
      return "api";
    case "schema":
      return "schema";
    case "job":
    case "worker":
      return "job";
    case "package":
      return "package";
    case "service":
      return "service";
    default:
      return undefined;
  }
}

function inferChangedNodes(graph: ServiceTopologyGraph, invalidatedPaths: string[]): string[] {
  if (invalidatedPaths.length === 0) return [];
  return graph.nodes
    .filter((node) => nodeTouchesInvalidated(node, new Set(invalidatedPaths)))
    .map((node) => node.id)
    .sort();
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function hashShort(value: string): string {
  return topologyEvidenceId([value]).slice("topology:".length, "topology:".length + 8);
}
