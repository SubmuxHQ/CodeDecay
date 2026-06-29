import { describe, expect, it } from "vitest";
import { createPlaywrightHarness } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("createPlaywrightHarness", () => {
  it("plans a Playwright browser-flow check", async () => {
    const harness = createPlaywrightHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("playwright");
    expect(harness.capabilities).toEqual(["browser-flow", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "playwright",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm exec playwright test");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createPlaywrightHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "browser-flow",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createPlaywrightHarness({
      command: "node playwright-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "playwright-pass.js", "console.log('playwright ok');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("Playwright checks passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "playwright ok"
    });
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createPlaywrightHarness({
      command: "node playwright-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "playwright-fail.js", "console.error('playwright failed'); process.exit(7);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node playwright-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 7,
      stderr: "playwright failed"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createPlaywrightHarness({
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
});
