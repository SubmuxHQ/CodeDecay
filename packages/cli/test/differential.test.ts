import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDifferentialRepo, createLowRiskRepo, createTempDir, gitOutput, run } from "./helpers";

describe("codedecay differential CLI contract", () => {
  it("reports changed structured probe output between base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "changed",
      total: 1,
      changed: 1
    });
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: ["structured stdout changed"],
      base: {
        status: "passed",
        structuredOutput: { value: "base" }
      },
      head: {
        status: "passed",
        structuredOutput: { value: "head" }
      }
    });
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-base-");
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-head-");
  });

  it("passes when configured probes behave the same on base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Differential Report");
    expect(result.stdout).toContain("**Overall status:** Passed");
  });

  it("skips differential probes when command execution is disabled", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: false });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary.status).toBe("skipped");
    expect(report.results[0].status).toBe("skipped");
  });

  it("writes differential reports to relative --output paths from --cwd", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });
    const outsideCwd = createTempDir();

    const result = await run(
      ["differential", "--cwd", repo, "--base", base, "--head", head, "--format", "json", "--output", "codedecay-diff.json"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay-diff.json");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });

  it("fails clearly when differential refs are missing", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["differential", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("codedecay differential requires --base <ref> and --head <ref>.");
  });
});
