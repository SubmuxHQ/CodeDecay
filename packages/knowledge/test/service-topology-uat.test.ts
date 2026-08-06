import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildServiceTopologyReport,
  parseAsyncApiTopology,
  parseOpenApiTopology
} from "../src";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT service topology (#684)", () => {
  it("UAT-TOPOLOGY-1: breaking producer change identifies only the API consumer", () => {
    const workspace = tempRoot();
    const billing = initRepo(join(workspace, "billing"));
    const checkout = initRepo(join(workspace, "checkout"));
    const decoy = initRepo(join(workspace, "decoy"));
    write(billing, "openapi.yaml", openApi("Billing API", "/v1/invoices", "getInvoice"));
    write(workspace, "topology.yml", multiRepoManifest({ billing, checkout, decoy, observedAt: "2026-08-06T00:00:00.000Z" }));

    const report = buildServiceTopologyReport({
      rootDir: workspace,
      manifest: "topology.yml",
      openapi: ["billing/openapi.yaml"],
      repositoryId: "repo:billing",
      revision: "head",
      producerServiceId: "service:billing",
      changedNodeIds: ["api:billing:v1"],
      now: new Date("2026-08-06T00:00:00.000Z")
    });

    expect(report.impact.impacts.map((impact) => impact.dependencyNodeId)).toEqual(["service:checkout"]);
    expect(report.impact.impacts.map((impact) => impact.repositoryId)).not.toContain("repo:decoy");
    expect(report.safety.repositoriesCloned).toBe(false);
  });

  it("UAT-TOPOLOGY-2: event schema change identifies subscriber and owning team", () => {
    const rootDir = tempRoot();
    write(rootDir, "asyncapi.yaml", asyncApi("payout.completed"));
    write(rootDir, "topology.yml", [
      "schemaVersion: 1",
      "nodes:",
      "  - id: service:ledger",
      "    kind: service",
      "    label: Ledger",
      "    repositoryId: repo:ledger",
      "    confidence: declared",
      "    freshness: current",
      "    trustClass: declared-context",
      "    sources:",
      "      - kind: manifest",
      "        source: topology.yml",
      "        repositoryId: repo:topology",
      "        revision: abc",
      "        observedAt: 2026-08-06T00:00:00.000Z",
      "    limitations: []",
      "  - id: team:finance",
      "    kind: team",
      "    label: Finance",
      "    confidence: declared",
      "    freshness: current",
      "    trustClass: declared-context",
      "    sources:",
      "      - kind: manifest",
      "        source: topology.yml",
      "        repositoryId: repo:topology",
      "        revision: abc",
      "        observedAt: 2026-08-06T00:00:00.000Z",
      "    limitations: []",
      "edges:",
      "  - id: edge:finance-owns-ledger",
      "    from: team:finance",
      "    to: service:ledger",
      "    kind: owns",
      "    confidence: declared",
      "    freshness: current",
      "    trustClass: declared-context",
      "    sources:",
      "      - kind: manifest",
      "        source: topology.yml",
      "        repositoryId: repo:topology",
      "        revision: abc",
      "        observedAt: 2026-08-06T00:00:00.000Z",
      "    limitations: []",
      "limitations: []",
      ""
    ].join("\n"));

    const report = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      asyncapi: ["asyncapi.yaml"],
      repositoryId: "repo:events",
      revision: "head",
      subscriberServiceId: "service:ledger",
      publisherServiceId: "service:payouts",
      now: new Date("2026-08-06T00:00:00.000Z")
    });
    const topic = report.graph.nodes.find((node) => node.kind === "event-topic");
    expect(topic).toBeTruthy();
    const impact = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      asyncapi: ["asyncapi.yaml"],
      repositoryId: "repo:events",
      revision: "head",
      subscriberServiceId: "service:ledger",
      publisherServiceId: "service:payouts",
      changedNodeIds: [topic!.id],
      now: new Date("2026-08-06T00:00:00.000Z")
    });

    expect(impact.impact.impacts[0]).toMatchObject({
      dependencyNodeId: "service:ledger",
      ownerTeamIds: ["team:finance"],
      relationship: "subscribes"
    });
  });

  it("UAT-TOPOLOGY-3: stale manifest cannot prove impact or safety", () => {
    const rootDir = tempRoot();
    write(rootDir, "topology.yml", staleManifest());
    const report = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      changedNodeIds: ["api:billing:v1"],
      now: new Date("2026-08-06T00:00:00.000Z")
    });

    expect(report.impact.impacts[0]).toMatchObject({ proof: "untrusted", freshness: "stale" });
    expect(report.impact.gaps.map((gap) => gap.reason)).toContain("stale-dependency");
    expect(report.impact.safety.inferredRiskTrusted).toBe(false);
  });

  it("UAT-TOPOLOGY-4: unavailable consumer leaves an explicit verification gap", () => {
    const rootDir = tempRoot();
    write(rootDir, "topology.yml", unavailableConsumerManifest());
    const report = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      changedNodeIds: ["api:billing:v1"],
      now: new Date("2026-08-06T00:00:00.000Z")
    });

    expect(report.impact.gaps.map((gap) => gap.reason)).toContain("unavailable-repository");
    expect(report.agentTasks.some((task) => task.detail.includes("available"))).toBe(true);
  });

  it("UAT-TOPOLOGY-5: CLI-shaped and MCP-shaped reports share stable evidence IDs", () => {
    const rootDir = tempRoot();
    write(rootDir, "topology.yml", unavailableConsumerManifest());
    const cli = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      changedNodeIds: ["api:billing:v1"],
      now: new Date("2026-08-06T00:00:00.000Z")
    });
    const mcp = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      changedNodeIds: ["api:billing:v1"],
      now: new Date("2026-08-06T00:00:00.000Z")
    });

    expect(cli.impact.impacts.map((impact) => impact.evidenceId)).toEqual(
      mcp.impact.impacts.map((impact) => impact.evidenceId)
    );
    expect(cli.impact.gaps.map((gap) => gap.evidenceId)).toEqual(mcp.impact.gaps.map((gap) => gap.evidenceId));
  });

  it("parses OpenAPI and AsyncAPI without remote refs and blocks http $ref", () => {
    const rootDir = tempRoot();
    write(rootDir, "openapi.yaml", openApi("Demo", "/v1/demo", "getDemo"));
    write(rootDir, "asyncapi.yaml", asyncApi("demo.created"));
    write(rootDir, "bad-openapi.yaml", "openapi: 3.0.0\npaths:\n  /x:\n    get:\n      $ref: https://example.com/ops.yaml#/get\n");

    expect(parseOpenApiTopology({
      rootDir,
      path: "openapi.yaml",
      repositoryId: "repo:demo",
      revision: "1",
      now: new Date("2026-08-06T00:00:00.000Z")
    }).nodes.some((node) => node.kind === "api")).toBe(true);
    expect(parseAsyncApiTopology({
      rootDir,
      path: "asyncapi.yaml",
      repositoryId: "repo:demo",
      revision: "1",
      now: new Date("2026-08-06T00:00:00.000Z")
    }).nodes.some((node) => node.kind === "event-topic")).toBe(true);
    expect(() => parseOpenApiTopology({
      rootDir,
      path: "bad-openapi.yaml",
      repositoryId: "repo:demo",
      revision: "1"
    })).toThrow(/remote \$ref is blocked/i);
  });

  it("incrementally invalidates only the changed OpenAPI contract", () => {
    const rootDir = tempRoot();
    write(rootDir, "openapi-a.yaml", openApi("A", "/a", "getA"));
    write(rootDir, "openapi-b.yaml", openApi("B", "/b", "getB"));
    write(rootDir, "topology.yml", [
      "schemaVersion: 1",
      "nodes: []",
      "edges: []",
      "limitations: []",
      ""
    ].join("\n"));

    const first = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      openapi: ["openapi-a.yaml", "openapi-b.yaml"],
      repositoryId: "repo:demo",
      revision: "1",
      now: new Date("2026-08-06T00:00:00.000Z")
    });
    expect(first.graph.nodes.filter((node) => node.kind === "api")).toHaveLength(2);

    write(rootDir, "openapi-a.yaml", openApi("A2", "/a2", "getA2"));
    const second = buildServiceTopologyReport({
      rootDir,
      manifest: "topology.yml",
      openapi: ["openapi-a.yaml", "openapi-b.yaml"],
      repositoryId: "repo:demo",
      revision: "2",
      invalidatePaths: ["openapi-a.yaml"],
      now: new Date("2026-08-06T00:00:00.000Z")
    });

    expect(second.invalidatedPaths).toEqual(["openapi-a.yaml"]);
    expect(second.graph.nodes.some((node) => String(node.metadata?.route ?? "") === "/a2")).toBe(true);
    expect(second.graph.nodes.some((node) => String(node.metadata?.route ?? "") === "/b")).toBe(true);
    expect(readFileSync(join(rootDir, ".codedecay/local/service-topology.json"), "utf8")).toContain("openapi-a.yaml");
  });
});

function multiRepoManifest(input: {
  billing: string;
  checkout: string;
  decoy: string;
  observedAt: string;
}): string {
  return [
    "schemaVersion: 1",
    "nodes:",
    "  - id: api:billing:v1",
    "    kind: api",
    "    label: Billing API",
    "    repositoryId: repo:billing",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    `        observedAt: ${input.observedAt}`,
    "    limitations: []",
    "  - id: service:billing",
    "    kind: service",
    "    label: Billing",
    "    repositoryId: repo:billing",
    `    repositoryRoot: ${input.billing}`,
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    `        observedAt: ${input.observedAt}`,
    "    limitations: []",
    "  - id: service:checkout",
    "    kind: service",
    "    label: Checkout",
    "    repositoryId: repo:checkout",
    `    repositoryRoot: ${input.checkout}`,
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    `        observedAt: ${input.observedAt}`,
    "    limitations: []",
    "  - id: service:decoy",
    "    kind: service",
    "    label: Decoy",
    "    repositoryId: repo:decoy",
    `    repositoryRoot: ${input.decoy}`,
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    `        observedAt: ${input.observedAt}`,
    "    limitations: []",
    "edges:",
    "  - id: edge:checkout-calls-billing",
    "    from: service:checkout",
    "    to: api:billing:v1",
    "    kind: calls",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    `        observedAt: ${input.observedAt}`,
    "    limitations: []",
    "limitations:",
    "  - Explicit multi-repo fixture only.",
    ""
  ].join("\n");
}

function staleManifest(): string {
  return [
    "schemaVersion: 1",
    "nodes:",
    "  - id: api:billing:v1",
    "    kind: api",
    "    label: Billing API",
    "    repositoryId: repo:billing",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    "        observedAt: 2025-01-01T00:00:00.000Z",
    "    limitations: []",
    "  - id: service:checkout",
    "    kind: service",
    "    label: Checkout",
    "    repositoryId: repo:checkout",
    "    available: true",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    "        observedAt: 2025-01-01T00:00:00.000Z",
    "    limitations: []",
    "edges:",
    "  - id: edge:checkout-calls-billing",
    "    from: service:checkout",
    "    to: api:billing:v1",
    "    kind: calls",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    "        observedAt: 2025-01-01T00:00:00.000Z",
    "    limitations: []",
    "limitations: []",
    ""
  ].join("\n");
}

function unavailableConsumerManifest(): string {
  return [
    "schemaVersion: 1",
    "nodes:",
    "  - id: api:billing:v1",
    "    kind: api",
    "    label: Billing API",
    "    repositoryId: repo:billing",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    "        observedAt: 2026-08-06T00:00:00.000Z",
    "    limitations: []",
    "  - id: service:missing",
    "    kind: service",
    "    label: Missing",
    "    repositoryId: repo:missing",
    "    available: false",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    "        observedAt: 2026-08-06T00:00:00.000Z",
    "    limitations: []",
    "edges:",
    "  - id: edge:missing-calls-billing",
    "    from: service:missing",
    "    to: api:billing:v1",
    "    kind: calls",
    "    confidence: declared",
    "    freshness: current",
    "    trustClass: declared-context",
    "    sources:",
    "      - kind: manifest",
    "        source: topology.yml",
    "        repositoryId: repo:topology",
    "        revision: abc",
    "        observedAt: 2026-08-06T00:00:00.000Z",
    "    limitations: []",
    "limitations: []",
    ""
  ].join("\n");
}

function openApi(title: string, route: string, operationId: string): string {
  return [
    "openapi: 3.0.3",
    "info:",
    `  title: ${title}`,
    "  version: 1.0.0",
    "paths:",
    `  ${route}:`,
    "    get:",
    `      operationId: ${operationId}`,
    "      responses:",
    "        '200':",
    "          description: ok",
    ""
  ].join("\n");
}

function asyncApi(channel: string): string {
  return [
    "asyncapi: 2.6.0",
    "info:",
    "  title: Events",
    "  version: 1.0.0",
    "channels:",
    `  ${channel}:`,
    "    publish:",
    "      message:",
    "        payload:",
    "          type: object",
    "    subscribe:",
    "      message:",
    "        payload:",
    "          type: object",
    ""
  ].join("\n");
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-topo-uat-"));
  roots.push(root);
  return root;
}

function initRepo(path: string): string {
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["-C", path, "init", "-b", "main"], { stdio: "ignore" });
  execFileSync("git", ["-C", path, "config", "user.email", "test@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", path, "config", "user.name", "Test"], { stdio: "ignore" });
  write(path, "README.md", "# fixture\n");
  execFileSync("git", ["-C", path, "add", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", path, "commit", "-m", "init"], { stdio: "ignore" });
  return path;
}

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}
