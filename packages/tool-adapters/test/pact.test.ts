import { describe, expect, it } from "vitest";
import { createPactHarness } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("createPactHarness", () => {
  it("plans a Pact contract testing check", async () => {
    const harness = createPactHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("pact");
    expect(harness.capabilities).toEqual(["contract-testing", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "pact",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm run test:pact");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createPactHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "contract",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createPactHarness({
      command: "node pact-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "pact-pass.js", "console.log('contracts verified');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("Pact contract tests passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "contracts verified"
    });
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createPactHarness({
      command: "node pact-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "pact-fail.js", "console.error('contract mismatch'); process.exit(14);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node pact-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 14,
      stderr: "contract mismatch"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createPactHarness({
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
    expect(() => createPactHarness({ command: "" })).toThrow("Pact command is required.");
    expect(() => createPactHarness({ timeoutMs: 0 })).toThrow("Pact timeoutMs must be a positive integer.");
    expect(() => createPactHarness({ outputLimit: 0 })).toThrow("Pact outputLimit must be a positive integer.");
  });
});
