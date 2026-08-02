import type {
  ServiceTopologyEdge,
  ServiceTopologyGap,
  ServiceTopologyGraph,
  ServiceTopologyImpact,
  ServiceTopologyImpactReport,
  ServiceTopologyNode
} from "./types";
import { SERVICE_TOPOLOGY_SCHEMA_VERSION } from "./types";
import { topologyEvidenceId } from "./manifest";

const DEPENDENCY_EDGES = new Set(["consumes", "calls", "subscribes", "reads", "compatibility-requires"]);

export function analyzeServiceTopologyImpact(graph: ServiceTopologyGraph, changedNodeIds: string[]): ServiceTopologyImpactReport {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const normalizedChanged = [...new Set(changedNodeIds)].sort();
  const impacts: ServiceTopologyImpact[] = [];
  const gaps: ServiceTopologyGap[] = [];

  for (const changedNodeId of normalizedChanged) {
    if (!nodes.has(changedNodeId)) {
      gaps.push(gap(changedNodeId, undefined, "unresolved-consumer", `Map changed contract ${changedNodeId} to an explicit topology node.`));
      continue;
    }
    for (const edge of graph.edges.filter((item) => item.to === changedNodeId && DEPENDENCY_EDGES.has(item.kind))) {
      const dependency = nodes.get(edge.from);
      if (!dependency) continue;
      impacts.push(createImpact(graph, changedNodeId, dependency, edge));
      appendGaps(gaps, dependency, edge);
    }
  }

  return {
    tool: "CodeDecay",
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    changedNodeIds: normalizedChanged,
    impacts: uniqueBy(impacts, (impact) => impact.evidenceId).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    gaps: uniqueBy(gaps, (item) => item.evidenceId).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    safety: {
      repositoriesCloned: false,
      networkCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      inferredRiskTrusted: false
    }
  };
}

export function renderServiceTopologyImpactMarkdown(report: ServiceTopologyImpactReport): string {
  const lines = ["## CodeDecay Cross-Repository Impact", "", `Changed topology nodes: ${report.changedNodeIds.length}`, "", "### Downstream Dependencies", ""];
  if (report.impacts.length === 0) lines.push("No known downstream dependency matched. This does not prove that external consumers do not exist.", "");
  for (const impact of report.impacts) {
    lines.push(
      `- **${impact.dependencyNodeId}** via \`${impact.relationship}\` (${impact.proof}, ${impact.freshness})`,
      `  - Repository: \`${impact.repositoryId ?? "unresolved"}\``,
      `  - Deployment units: ${impact.deploymentUnitIds.map((id) => `\`${id}\``).join(", ") || "none declared"}`,
      `  - Owners: ${impact.ownerTeamIds.map((id) => `\`${id}\``).join(", ") || "none declared"}`,
      `  - Required checks: ${impact.requiredChecks.join(" ")}`
    );
  }
  lines.push("", "### Verification Gaps", "");
  if (report.gaps.length === 0) lines.push("No topology verification gaps were recorded.");
  for (const item of report.gaps) lines.push(`- \`${item.reason}\` for \`${item.nodeId}\`: ${item.verificationTask}`);
  lines.push("", "### Safety", "", "- No repositories cloned, commands run, network calls made, or telemetry sent.", "- Inferred and stale dependencies remain untrusted until corroborated.", "");
  return `${lines.join("\n")}\n`;
}

function createImpact(graph: ServiceTopologyGraph, changedNodeId: string, dependency: ServiceTopologyNode, edge: ServiceTopologyEdge): ServiceTopologyImpact {
  const related = graph.edges.filter((item) => item.from === dependency.id || item.to === dependency.id);
  const deploymentUnitIds = connectedNodeIds(graph, related, dependency.id, "deployment-unit");
  const ownerTeamIds = connectedNodeIds(graph, related, dependency.id, "team");
  const proof = edge.freshness !== "current" || edge.confidence === "inferred" ? "untrusted" : edge.confidence;
  return {
    evidenceId: topologyEvidenceId([changedNodeId, dependency.id, edge.id]),
    changedNodeId,
    dependencyNodeId: dependency.id,
    repositoryId: dependency.repositoryId,
    deploymentUnitIds,
    ownerTeamIds,
    relationship: edge.kind,
    proof,
    freshness: edge.freshness,
    requiredChecks: [
      `Check ${dependency.id} against the changed ${changedNodeId} contract at its current revision.`,
      ...(dependency.available === false ? [`Make repository ${dependency.repositoryId ?? dependency.id} available or record an explicit owner decision.`] : [])
    ],
    limitations: [...edge.limitations, ...dependency.limitations]
  };
}

function appendGaps(gaps: ServiceTopologyGap[], dependency: ServiceTopologyNode, edge: ServiceTopologyEdge): void {
  if (dependency.available === false) gaps.push(gap(dependency.id, dependency.repositoryId, "unavailable-repository", `Make ${dependency.repositoryId ?? dependency.id} available and run its configured compatibility checks.`));
  if (edge.freshness !== "current") gaps.push(gap(dependency.id, dependency.repositoryId, "stale-dependency", `Refresh topology evidence for ${edge.id} before using it for a merge decision.`));
  if (edge.confidence === "inferred") gaps.push(gap(dependency.id, dependency.repositoryId, "inferred-dependency", `Corroborate ${edge.id} with a current contract, package manifest, or runtime check.`));
  if (!dependency.repositoryId) gaps.push(gap(dependency.id, undefined, "unresolved-consumer", `Declare the repository and owner for ${dependency.id}.`));
}

function gap(nodeId: string, repositoryId: string | undefined, reason: ServiceTopologyGap["reason"], verificationTask: string): ServiceTopologyGap {
  return { evidenceId: topologyEvidenceId(["gap", reason, nodeId, repositoryId ?? "unknown"]), nodeId, repositoryId, reason, verificationTask };
}

function connectedNodeIds(graph: ServiceTopologyGraph, edges: ServiceTopologyEdge[], nodeId: string, kind: ServiceTopologyNode["kind"]): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return [...new Set(edges.flatMap((edge) => [edge.from, edge.to]).filter((id) => id !== nodeId && nodes.get(id)?.kind === kind))].sort();
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
