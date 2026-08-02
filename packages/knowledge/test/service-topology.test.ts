import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeServiceTopologyImpact,
  loadServiceTopologyManifest,
  normalizeServiceTopologyGraph,
  persistServiceTopologyArtifact,
  renderServiceTopologyImpactMarkdown,
  type ServiceTopologyGraph
} from "../src";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("cross-repository service topology", () => {
  it("finds only the declared downstream API consumer, deployment, and owner", () => {
    const graph = normalizeServiceTopologyGraph(topologyFixture());
    const report = analyzeServiceTopologyImpact(graph, ["api:billing:v1"]);

    expect(report.impacts).toEqual([
      expect.objectContaining({
        changedNodeId: "api:billing:v1",
        dependencyNodeId: "service:checkout",
        repositoryId: "repo:checkout",
        deploymentUnitIds: ["deployment:checkout"],
        ownerTeamIds: ["team:payments"],
        relationship: "calls",
        proof: "declared",
        freshness: "current"
      })
    ]);
    expect(report.impacts.map((impact) => impact.dependencyNodeId)).not.toContain("service:decoy");
    expect(report.gaps).toEqual([]);
    expect(report.safety).toEqual({
      repositoriesCloned: false,
      networkCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      inferredRiskTrusted: false
    });
    expect(renderServiceTopologyImpactMarkdown(report)).toContain("Check service:checkout against the changed api:billing:v1 contract");
  });

  it("keeps stale, inferred, unavailable, and unresolved consumers as explicit gaps", () => {
    const fixture = topologyFixture();
    fixture.nodes.push(node("service:legacy", "service", { repositoryId: "repo:legacy", available: false }));
    fixture.edges.push(edge("edge:legacy-calls-api", "service:legacy", "api:billing:v1", "calls", {
      confidence: "inferred",
      freshness: "current",
      observedAt: "2025-01-01T00:00:00.000Z"
    }));
    const graph = normalizeServiceTopologyGraph(fixture, { now: new Date("2026-08-02T00:00:00.000Z"), staleAfterDays: 30 });
    const report = analyzeServiceTopologyImpact(graph, ["api:billing:v1"]);
    const legacy = report.impacts.find((impact) => impact.dependencyNodeId === "service:legacy");

    expect(legacy).toMatchObject({ proof: "untrusted", freshness: "stale" });
    expect(report.gaps.map((gap) => gap.reason)).toEqual(expect.arrayContaining([
      "unavailable-repository",
      "stale-dependency",
      "inferred-dependency"
    ]));
    expect(report.gaps.every((gap) => gap.verificationTask.length > 0)).toBe(true);
  });

  it("loads a reviewable YAML manifest without resolving roots outside the configured repository", () => {
    const rootDir = tempRoot();
    write(rootDir, "topology.yml", [
      "schemaVersion: 1",
      "nodes:",
      "  - id: repo:local",
      "    kind: repository",
      "    label: Local repository",
      "    repositoryRoot: .",
      "    confidence: declared",
      "    freshness: current",
      "    trustClass: declared-context",
      "    sources:",
      "      - kind: manifest",
      "        source: topology.yml",
      "        repositoryId: repo:local",
      "        revision: abc123",
      "        observedAt: 2026-08-02T00:00:00.000Z",
      "    limitations: []",
      "  - id: repo:missing",
      "    kind: repository",
      "    label: Missing repository",
      "    repositoryRoot: ./missing",
      "    confidence: declared",
      "    freshness: current",
      "    trustClass: declared-context",
      "    sources:",
      "      - kind: manifest",
      "        source: topology.yml",
      "        repositoryId: repo:local",
      "        revision: abc123",
      "        observedAt: 2026-08-02T00:00:00.000Z",
      "    limitations: []",
      "edges: []",
      "limitations: []",
      ""
    ].join("\n"));

    const graph = loadServiceTopologyManifest({ rootDir, path: "topology.yml", now: new Date("2026-08-02T00:00:00.000Z") });

    expect(graph.nodes.find((node) => node.id === "repo:local")).toMatchObject({ repositoryRoot: realpathSync(rootDir), freshness: "current", available: true });
    expect(graph.nodes.find((node) => node.id === "repo:missing")).toMatchObject({ available: false });
    expect(() => loadServiceTopologyManifest({ rootDir, path: "../topology.yml" })).toThrow(/not found inside repository/i);
  });

  it("rejects duplicate IDs, missing edge targets, and source-free evidence", () => {
    const duplicate = topologyFixture();
    duplicate.nodes.push({ ...duplicate.nodes[0] as FixtureNode });
    expect(() => normalizeServiceTopologyGraph(duplicate)).toThrow(/duplicate topology node id/i);

    const missing = topologyFixture();
    missing.edges.push(edge("edge:missing", "service:checkout", "api:missing", "calls"));
    expect(() => normalizeServiceTopologyGraph(missing)).toThrow(/references a missing node/i);

    const sourceFree = topologyFixture();
    sourceFree.nodes[0] = { ...sourceFree.nodes[0], sources: [] };
    expect(() => normalizeServiceTopologyGraph(sourceFree)).toThrow(/must include at least one source/i);
  });

  it("keeps stable evidence IDs regardless of manifest ordering", () => {
    const first = normalizeServiceTopologyGraph(topologyFixture());
    const reversedInput = topologyFixture();
    reversedInput.nodes.reverse();
    reversedInput.edges.reverse();
    const second = normalizeServiceTopologyGraph(reversedInput);

    expect(analyzeServiceTopologyImpact(first, ["api:billing:v1"]).impacts.map((impact) => impact.evidenceId)).toEqual(
      analyzeServiceTopologyImpact(second, ["api:billing:v1"]).impacts.map((impact) => impact.evidenceId)
    );
  });

  it("persists an inspectable artifact only inside the repository", () => {
    const rootDir = tempRoot();
    const graph = normalizeServiceTopologyGraph(topologyFixture());

    const artifactPath = persistServiceTopologyArtifact(rootDir, graph);

    expect(artifactPath).toBe(".codedecay/local/service-topology.json");
    expect(JSON.parse(readFileSync(join(rootDir, artifactPath), "utf8"))).toMatchObject({ schemaVersion: 1 });
    expect(() => persistServiceTopologyArtifact(rootDir, graph, "../topology.json")).toThrow(/must stay inside repository/i);
  });

  it("does not read or write through symlinks that escape the repository", () => {
    const rootDir = tempRoot();
    const outsideDir = tempRoot();
    write(outsideDir, "topology.yml", "schemaVersion: 1\nnodes: []\nedges: []\nlimitations: []\n");
    symlinkSync(join(outsideDir, "topology.yml"), join(rootDir, "escaped.yml"));
    symlinkSync(outsideDir, join(rootDir, "escaped-output"));
    const graph = normalizeServiceTopologyGraph(topologyFixture());

    expect(() => loadServiceTopologyManifest({ rootDir, path: "escaped.yml" })).toThrow(/not found inside repository/i);
    expect(() => persistServiceTopologyArtifact(rootDir, graph, "escaped-output/topology.json")).toThrow(/must stay inside repository/i);
  });

  it("never treats missing or malformed observation timestamps as current proof", () => {
    const fixture = topologyFixture();
    fixture.edges[0] = {
      ...fixture.edges[0],
      confidence: "verified",
      sources: [{ kind: "manifest", source: "topology.yml", repositoryId: "repo:topology", revision: "abc123", observedAt: "not-a-date" }]
    };
    const graph = normalizeServiceTopologyGraph(fixture);
    const report = analyzeServiceTopologyImpact(graph, ["api:billing:v1"]);

    expect(graph.edges.find((edge) => edge.id === "edge:checkout-calls-billing")).toMatchObject({ freshness: "unknown", trustClass: "stale-context" });
    expect(report.impacts[0]).toMatchObject({ proof: "untrusted", freshness: "unknown" });
    expect(report.gaps.map((gap) => gap.reason)).toContain("stale-dependency");
  });
});

type FixtureNode = Record<string, unknown>;
type FixtureEdge = Record<string, unknown>;

function topologyFixture(): { schemaVersion: 1; nodes: FixtureNode[]; edges: FixtureEdge[]; limitations: string[] } {
  return {
    schemaVersion: 1,
    nodes: [
      node("api:billing:v1", "api", { repositoryId: "repo:billing" }),
      node("service:checkout", "service", { repositoryId: "repo:checkout", available: true }),
      node("deployment:checkout", "deployment-unit", { repositoryId: "repo:checkout" }),
      node("team:payments", "team"),
      node("service:decoy", "service", { repositoryId: "repo:decoy", available: true })
    ],
    edges: [
      edge("edge:checkout-calls-billing", "service:checkout", "api:billing:v1", "calls"),
      edge("edge:checkout-deploys", "service:checkout", "deployment:checkout", "deploys-with"),
      edge("edge:payments-owns-checkout", "team:payments", "service:checkout", "owns")
    ],
    limitations: ["Only explicitly configured repositories are represented."]
  };
}

function node(id: string, kind: string, extra: Record<string, unknown> = {}): FixtureNode {
  return {
    id,
    kind,
    label: id,
    confidence: "declared",
    freshness: "current",
    trustClass: "declared-context",
    sources: [{ kind: "manifest", source: "topology.yml", repositoryId: String(extra.repositoryId ?? "repo:topology"), revision: "abc123", observedAt: "2026-08-02T00:00:00.000Z" }],
    limitations: [],
    ...extra
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  kind: string,
  extra: { confidence?: string; freshness?: string; observedAt?: string } = {}
): FixtureEdge {
  return {
    id,
    from,
    to,
    kind,
    confidence: extra.confidence ?? "declared",
    freshness: extra.freshness ?? "current",
    trustClass: "declared-context",
    sources: [{ kind: "manifest", source: "topology.yml", repositoryId: "repo:topology", revision: "abc123", observedAt: extra.observedAt ?? "2026-08-02T00:00:00.000Z" }],
    limitations: []
  };
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-topology-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}
