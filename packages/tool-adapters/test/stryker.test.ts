import { describe, expect, it } from "vitest";
import { createStrykerHarness } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("createStrykerHarness", () => {
  it("plans a StrykerJS mutation check", async () => {
    const harness = createStrykerHarness();
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("stryker");
    expect(harness.capabilities).toEqual(["mutation-testing", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "stryker",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm exec stryker run");
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const harness = createStrykerHarness({ command: "node -e \"console.log('should not run')\"" });
    const plan = await harness.plan({ cwd: createTempDir(), evidence: [] });
    const result = await harness.run(plan, { cwd: createTempDir() });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "mutation",
      severity: "info",
      command: "node -e \"console.log('should not run')\""
    });
  });

  it("returns passed evidence for successful configured commands", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "node stryker-pass.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "stryker-pass.js", "console.log('mutation score 100');\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.evidence[0]?.summary).toBe("StrykerJS mutation checks passed.");
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "passed",
      stdout: "mutation score 100"
    });
  });

  it("surfaces surviving and no-coverage mutants from Stryker JSON reports", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "node stryker-pass.js",
      reportPath: "reports/mutation/mutation.json",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "stryker-pass.js", "console.log('mutation report written');\n");
    writeFile(
      repo,
      "reports/mutation/mutation.json",
      JSON.stringify(
        {
          thresholds: {
            mutationScore: 72.5
          },
          files: {
            "src/math.ts": {
              mutants: [
                {
                  id: "1",
                  status: "Survived",
                  mutatorName: "ArithmeticOperator",
                  replacement: "a - b",
                  location: { start: { line: 3, column: 10 }, end: { line: 3, column: 15 } }
                },
                {
                  id: "2",
                  status: "NoCoverage",
                  mutatorName: "ConditionalExpression",
                  location: { start: { line: 8, column: 2 }, end: { line: 8, column: 20 } }
                },
                {
                  id: "3",
                  status: "Killed",
                  mutatorName: "StringLiteral"
                }
              ]
            }
          }
        },
        null,
        2
      )
    );

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("no-evidence");
    expect(result.summary).toContain("StrykerJS found 2 surviving or no-coverage mutant");
    expect(result.artifacts).toEqual([
      {
        path: "reports/mutation/mutation.json",
        description: "StrykerJS mutation testing report."
      }
    ]);
    expect(result.evidence[1]).toMatchObject({
      kind: "mutation",
      severity: "high",
      artifactPath: "reports/mutation/mutation.json",
      metadata: {
        totalMutants: 3,
        survivedMutants: 1,
        noCoverageMutants: 1,
        mutationScore: 72.5
      }
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/math.ts",
          line: 3,
          summary: "Survived ArithmeticOperator mutant in src/math.ts:3."
        }),
        expect.objectContaining({
          file: "src/math.ts",
          line: 8,
          summary: "NoCoverage ConditionalExpression mutant in src/math.ts:8."
        })
      ])
    );
  });

  it("returns failed evidence for nonzero configured commands", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
      command: "node stryker-fail.js",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "stryker-fail.js", "console.error('mutation score too low'); process.exit(9);\n");

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("failed");
    expect(result.failure?.mode).toBe("nonzero-exit");
    expect(result.evidence[0]).toMatchObject({
      severity: "high",
      command: "node stryker-fail.js"
    });
    expect(result.evidence[0]?.metadata).toMatchObject({
      status: "failed",
      exitCode: 9,
      stderr: "mutation score too low"
    });
  });

  it("blocks unsafe commands through the shared execution policy", async () => {
    const repo = createTempDir();
    const harness = createStrykerHarness({
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
    expect(() => createStrykerHarness({ command: "" })).toThrow("StrykerJS command is required.");
    expect(() => createStrykerHarness({ reportPath: "" })).toThrow("StrykerJS reportPath is required.");
    expect(() => createStrykerHarness({ timeoutMs: 0 })).toThrow("StrykerJS timeoutMs must be a positive integer.");
  });
});
