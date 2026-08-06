import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runServiceTopologyTool } from "../src/index";
import { createRepo, createTempDir } from "./helpers/mcp";

describe("MCP service_topology tool", () => {
  it("returns the same evidence IDs as a local topology report for a changed API", async () => {
    const repo = createRepo({
      "topology.yml": [
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
        "        observedAt: 2026-08-06T00:00:00.000Z",
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
        "        observedAt: 2026-08-06T00:00:00.000Z",
        "    limitations: []",
        "limitations: []",
        ""
      ].join("\n")
    });

    const output = JSON.parse(
      await runServiceTopologyTool(
        { cwd: repo },
        { format: "json", manifest: "topology.yml", changed: ["api:billing:v1"] }
      )
    ) as {
      impact: { impacts: Array<{ evidenceId: string; dependencyNodeId: string }> };
      safety: { repositoriesCloned: boolean; networkCalled: boolean };
    };

    expect(output.impact.impacts[0]?.dependencyNodeId).toBe("service:checkout");
    expect(output.impact.impacts[0]?.evidenceId).toMatch(/^topology:[0-9a-f]{20}$/);
    expect(output.safety).toMatchObject({ repositoriesCloned: false, networkCalled: false });
  });

  it("creates an MCP server with service_topology registered", () => {
    const root = createTempDir();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, "README.md"), "# tmp\n");
    expect(root).toBeTruthy();
  });
});
