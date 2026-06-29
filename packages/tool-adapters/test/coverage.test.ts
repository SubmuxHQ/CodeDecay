import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCoverageHarness } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("createCoverageHarness", () => {
  it("plans a coverage evidence check", async () => {
    const harness = createCoverageHarness({
      command: "pnpm test -- --coverage",
      reportPaths: ["coverage/coverage-final.json"]
    });
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("coverage");
    expect(harness.capabilities).toEqual(["coverage", "test-execution", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "coverage",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("pnpm test -- --coverage");
  });

  it("collects existing Istanbul coverage artifacts without running a command", async () => {
    const repo = createTempDir();
    const harness = createCoverageHarness({
      reportPaths: ["coverage/coverage-final.json"]
    });
    writeFile(
      repo,
      "coverage/coverage-final.json",
      JSON.stringify({
        "src/auth.ts": {
          l: {
            "1": 1,
            "2": 0
          }
        }
      })
    );

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.artifacts).toEqual([
      {
        path: "coverage/coverage-final.json",
        description: "ISTANBUL coverage report."
      }
    ]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "coverage",
          severity: "medium",
          summary: "Coverage artifacts measured 2 line(s); 1 line(s) are uncovered."
        }),
        expect.objectContaining({
          file: "src/auth.ts",
          line: 2,
          severity: "medium",
          summary: "src/auth.ts has 1 uncovered measured line(s)."
        })
      ])
    );
  });

  it("does not parse stale coverage reportPaths when command execution is denied", async () => {
    const repo = createTempDir();
    const harness = createCoverageHarness({
      command: "node coverage.js",
      reportPaths: ["coverage/coverage-final.json"],
      failOn: "uncovered"
    });
    writeFile(
      repo,
      "coverage/coverage-final.json",
      JSON.stringify({
        "src/auth.ts": {
          l: {
            "1": 0
          }
        }
      })
    );

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.artifacts).toEqual([]);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      kind: "coverage",
      severity: "info"
    });
  });

  it("fails when configured coverage artifacts have uncovered lines and failOn is uncovered", async () => {
    const repo = createTempDir();
    const harness = createCoverageHarness({
      command: "node coverage-pass.js",
      reportPaths: ["coverage/lcov.info"],
      failOn: "uncovered",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(repo, "coverage-pass.js", "console.log('coverage done');\n");
    writeFile(repo, "coverage/lcov.info", ["SF:src/session.ts", "DA:1,1", "DA:2,0", "end_of_record", ""].join("\n"));

    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(plan.requiresApproval).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.failure).toMatchObject({
      mode: "tool-finding",
      message: "Coverage artifacts contain 1 uncovered measured line(s)."
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "coverage",
          severity: "high",
          summary: "Coverage artifacts measured 2 line(s); 1 line(s) are uncovered."
        }),
        expect.objectContaining({
          file: "src/session.ts",
          line: 2,
          severity: "high",
          artifactPath: "coverage/lcov.info"
        })
      ])
    );
  });

  it("validates configured options", () => {
    expect(() => createCoverageHarness({ command: "" })).toThrow("Coverage command is required.");
    expect(() => createCoverageHarness({ reportPaths: [] })).toThrow("Coverage reportPaths must contain at least one path.");
    expect(() => createCoverageHarness({ reportPaths: [""] })).toThrow("Coverage reportPath is required.");
    expect(() => createCoverageHarness({ failOn: "partial" as "uncovered" })).toThrow(
      "Coverage failOn must be none or uncovered."
    );
    expect(() => createCoverageHarness({ timeoutMs: 0 })).toThrow("Coverage timeoutMs must be a positive integer.");
  });
});
