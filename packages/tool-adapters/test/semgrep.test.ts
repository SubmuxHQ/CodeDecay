import { describe, expect, it } from "vitest";
import { createSemgrepHarness } from "../src/index";
import { createSemgrepReport, createTempDir, writeFile } from "./helpers";

describe("createSemgrepHarness", () => {
  it("plans a Semgrep static analysis check", async () => {
    const harness = createSemgrepHarness({ config: ".semgrep.yml" });
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("semgrep");
    expect(harness.capabilities).toEqual(["static-analysis", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "semgrep",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("semgrep scan --config .semgrep.yml --json --metrics=off --disable-version-check");
  });

  it("skips when no local Semgrep config is available", async () => {
    const harness = createSemgrepHarness({ allowCommands: true, timeoutMs: 1000 });
    const repo = createTempDir();
    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("missing-config");
    expect(result.evidence[0]).toMatchObject({
      kind: "static-analysis",
      severity: "info"
    });
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createSemgrepHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "static-analysis",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("does not parse stale Semgrep reportPath when command execution is denied", async () => {
    const repo = createTempDir();
    const harness = createSemgrepHarness({
      command: "node semgrep-json.js",
      reportPath: "reports/semgrep.json"
    });
    writeFile(repo, "reports/semgrep.json", JSON.stringify(createSemgrepReport("ERROR"), null, 2));

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.artifacts).toEqual([]);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      kind: "static-analysis",
      severity: "info"
    });
  });

  it("parses Semgrep JSON stdout and fails on high findings by default", async () => {
    const repo = createTempDir();
    const harness = createSemgrepHarness({
      command: "node semgrep-json.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "semgrep-json.js", `console.log(${JSON.stringify(JSON.stringify(createSemgrepReport("ERROR")))});\n`);

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("tool-finding");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "static-analysis",
          severity: "high",
          summary: "javascript.express.security.audit.xss: User input reaches response in src/app.ts:12.",
          file: "src/app.ts",
          line: 12,
          metadata: expect.objectContaining({
            checkId: "javascript.express.security.audit.xss",
            severity: "ERROR"
          })
        })
      ])
    );
  });

  it("parses configured Semgrep reportPath and respects failOnSeverity", async () => {
    const repo = createTempDir();
    const harness = createSemgrepHarness({
      command: "node semgrep-pass.js",
      reportPath: "reports/semgrep.json",
      failOnSeverity: "high",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "semgrep-pass.js", "console.log('semgrep done');\n");
    writeFile(repo, "reports/semgrep.json", JSON.stringify(createSemgrepReport("WARNING"), null, 2));

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("passed");
    expect(result.artifacts).toEqual([{ path: "reports/semgrep.json", description: "Semgrep JSON report." }]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "static-analysis",
          severity: "medium",
          artifactPath: "reports/semgrep.json"
        })
      ])
    );
  });

  it("validates configured options", () => {
    expect(() => createSemgrepHarness({ command: "" })).toThrow("Semgrep command is required.");
    expect(() => createSemgrepHarness({ config: "auto" })).toThrow("Semgrep config must be a local path.");
    expect(() => createSemgrepHarness({ config: "p/default" })).toThrow("Semgrep config must be a local path.");
    expect(() => createSemgrepHarness({ config: "https://semgrep.dev/p/default" })).toThrow(
      "Semgrep config must be a local path."
    );
    expect(() => createSemgrepHarness({ reportPath: "" })).toThrow("Semgrep reportPath is required.");
    expect(() => createSemgrepHarness({ failOnSeverity: "critical" as "high" })).toThrow(
      "Semgrep failOnSeverity must be low, medium, or high."
    );
    expect(() => createSemgrepHarness({ timeoutMs: 0 })).toThrow("Semgrep timeoutMs must be a positive integer.");
  });
});
