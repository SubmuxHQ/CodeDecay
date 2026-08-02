import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("codedecay runtime CLI", () => {
  it("writes revision-aware, topology-correlated local evidence", async () => {
    const root = createRepo();
    mkdirSync(join(root, ".codedecay", "runtime"), { recursive: true });
    writeFileSync(join(root, ".codedecay", "runtime", "traces.json"), JSON.stringify({
      resourceSpans: [{
        resource: { attributes: [attr("service.name", "api"), attr("service.version", "head")] },
        scopeSpans: [{ spans: [{ name: "GET /health", spanId: "abc", flags: 1, startTimeUnixNano: "0", endTimeUnixNano: "2000000", attributes: [attr("http.route", "/health")] }] }]
      }]
    }), "utf8");
    writeFileSync(join(root, "topology.json"), JSON.stringify({
      schemaVersion: 1,
      nodes: [{ id: "service:api", kind: "service", label: "api", confidence: "declared", freshness: "unknown", trustClass: "declared-context", sources: [{ kind: "manifest", source: "fixture", repositoryId: "repo", revision: "head" }], limitations: [] }],
      edges: [],
      limitations: []
    }), "utf8");

    const result = await run(["runtime", "--cwd", root, "--telemetry", ".codedecay/runtime/traces.json", "--topology", "topology.json", "--head-revision", "head", "--format", "json", "--output", "reports/runtime.json"]);
    const report = JSON.parse(readFileSync(join(root, "reports", "runtime.json"), "utf8")) as { operations: Array<{ trust: string; topologyNodeIds: string[] }>; safety: { networkCalled: boolean } };

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(report.operations[0]).toMatchObject({ trust: "current-revision", topologyNodeIds: ["service:api"] });
    expect(report.safety.networkCalled).toBe(false);
  });

  it("renders useful limitations with no configured exports", async () => {
    const result = await run(["runtime", "--cwd", createRepo()]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No runtime operations were ingested.");
    expect(result.stdout).toContain("No local OpenTelemetry export was configured");
    expect(result.stdout).toContain("No structured error export was configured");
    expect(result.stdout).toContain("no network or command execution");
  });
});

async function run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { exitCode, stdout, stderr };
}

function createRepo(): string {
  const root = join(tmpdir(), `codedecay-runtime-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  roots.push(root);
  return root;
}

function attr(key: string, value: string): unknown {
  return { key, value: { stringValue: value } };
}
