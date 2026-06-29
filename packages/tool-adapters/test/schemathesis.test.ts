import { describe, expect, it } from "vitest";
import { createSchemathesisHarness } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("createSchemathesisHarness", () => {
  it("plans a Schemathesis API fuzzing check", async () => {
    const harness = createSchemathesisHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("schemathesis");
    expect(harness.capabilities).toEqual(["api-fuzzing", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "schemathesis",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("st run openapi.yaml --url http://127.0.0.1:3000");
  });

  it("builds the default command from configured schema and baseUrl", async () => {
    const harness = createSchemathesisHarness({
      schema: "docs/openapi.yaml",
      baseUrl: "http://127.0.0.1:8080"
    });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });

    expect(plan.steps[0]?.description).toContain("st run docs/openapi.yaml --url http://127.0.0.1:8080");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createSchemathesisHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "api-fuzz",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createSchemathesisHarness({
      command: "node schemathesis-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "schemathesis-pass.js", "console.log('api fuzzing ok');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("Schemathesis API fuzzing passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "api fuzzing ok"
    });
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createSchemathesisHarness({
      command: "node schemathesis-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "schemathesis-fail.js", "console.error('server error found'); process.exit(12);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node schemathesis-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 12,
      stderr: "server error found"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createSchemathesisHarness({
      command: "rm -rf ./tmp",
      allowCommands: true,
      timeoutMs: 1000
    });

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("unsafe-command");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "rm -rf ./tmp"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "blocked",
      blockedReason: "recursive or forced file deletion"
    });
  });

  it("validates configured options", () => {
    expect(() => createSchemathesisHarness({ command: "" })).toThrow("Schemathesis command is required.");
    expect(() => createSchemathesisHarness({ schema: " " })).toThrow("Schemathesis schema is required.");
    expect(() => createSchemathesisHarness({ timeoutMs: 0 })).toThrow(
      "Schemathesis timeoutMs must be a positive integer."
    );
  });
});
