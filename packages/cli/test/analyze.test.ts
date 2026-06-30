import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBroadLowOnlyRepo, createHighRiskRepo, createLowRiskRepo, createMediumRiskRepo, createNextRouteRiskRepo, createTempDir, expectExit, git, run, stableReport, writeFile } from "./helpers";

describe("codedecay analyze CLI contract", () => {
  it("renders JSON and markdown to stdout", async () => {
    const repo = createLowRiskRepo();

    const json = await run(["analyze", "--format", "json"], repo);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "low"
      }
    });

    const markdown = await run(["analyze", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Report");
    expect(markdown.stdout).toContain("Merge risk");
  });

  it("renders PR comment markdown to stdout", async () => {
    const repo = createMediumRiskRepo();
    const result = await run(["analyze", "--format", "pr-comment"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("## CodeDecay PR Check");
    expect(result.stdout).toContain("**Lead catch:**");
    expect(result.stdout).toContain("<summary>Full CodeDecay report</summary>");
    expect(result.stdout).toContain("Found by [CodeDecay](https://github.com/SubmuxHQ/CodeDecay)");
  });

  it("writes SARIF with --output and resolves relative output from --cwd", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(
      ["analyze", "--cwd", repo, "--format", "sarif", "--output", "codedecay.sarif"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay.sarif");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      version: "2.1.0"
    });
  });

  it("keeps absolute --output paths absolute", async () => {
    const repo = createLowRiskRepo();
    const outputPath = join(createTempDir(), "absolute-output.json");

    const result = await run(["analyze", "--format", "json", "--output", outputPath], repo);

    expect(result.exitCode).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8")).tool).toBe("CodeDecay");
  });

  it("uses --cwd as the repository being analyzed", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["analyze", "--cwd", repo, "--format", "json"], outsideCwd);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(report.summary.riskLevel).toBe("medium");
  });

  it("reports framework-aware route and API impacts", async () => {
    const repo = createNextRouteRiskRepo();

    const json = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(report.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"],
          risk: "high"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard",
          methods: [],
          risk: "medium"
        })
      ])
    );

    const markdown = await run(["analyze", "--format", "markdown"], repo);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("### Likely Impacted Routes And APIs");
    expect(markdown.stdout).toContain("High `GET, POST /api/users` (Next.js API route)");
    expect(markdown.stdout).toContain("Medium `/dashboard` (Next.js UI route)");
  });

  it("returns correct exit codes for --fail-on thresholds", async () => {
    const lowRepo = createLowRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], lowRepo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], lowRepo, 0);
    await expectExit(["analyze", "--fail-on", "low"], lowRepo, 1);

    const mediumRepo = createMediumRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], mediumRepo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], mediumRepo, 1);
    await expectExit(["analyze", "--fail-on", "low"], mediumRepo, 1);

    const highRepo = createHighRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], highRepo, 1);
    await expectExit(["analyze", "--fail-on", "medium"], highRepo, 1);
    await expectExit(["analyze", "--fail-on", "low"], highRepo, 1);
  });

  it("includes design contract violations and gates them under fail-on", async () => {
    const repo = createMediumRiskRepo();
    writeFile(
      repo,
      "codedecay.contract.json",
      JSON.stringify(
        {
          version: 1,
          activeScopeFence: "auth-only",
          scopeFences: [
            {
              id: "auth-only",
              allowedAreas: ["auth"]
            }
          ]
        },
        null,
        2
      )
    );

    const result = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-scope-fence",
          category: "scope",
          file: "src/api/users.ts"
        })
      ])
    );
    await expectExit(["analyze", "--fail-on", "low"], repo, 1);
  });

  it("does not fail the high gate for broad low-severity docs/source/test changes", async () => {
    const repo = createBroadLowOnlyRepo();
    const result = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      mergeRiskScore: 39,
      riskLevel: "low"
    });
    expect(report.summary.findingCounts.low).toBeGreaterThanOrEqual(12);

    await expectExit(["analyze", "--fail-on", "high"], repo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], repo, 0);
    await expectExit(["analyze", "--fail-on", "low"], repo, 1);
  });

  it("fails clearly for invalid base/head refs", async () => {
    const repo = createLowRiskRepo();

    const result = await run(
      ["analyze", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"],
      repo
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
    expect(result.stderr).toContain("Check --base/--head and fetch the ref before running CodeDecay.");
  });

  it("fails clearly for invalid head refs", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["analyze", "--head", "definitely-missing-head", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-head".');
    expect(result.stderr).toContain("Check --base/--head and fetch the ref before running CodeDecay.");
  });

  it("fails clearly outside a git repository", async () => {
    const nonGitDir = createTempDir();

    const result = await run(["analyze", "--format", "json"], nonGitDir);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `CodeDecay failed: ${nonGitDir} is not a git repository. Run from a git repo or pass --cwd <repo>.\n`
    );
  });

  it("has deterministic report content after ignoring generatedAt", async () => {
    const repo = createMediumRiskRepo();

    const first = stableReport((await run(["analyze", "--format", "json"], repo)).stdout);
    const second = stableReport((await run(["analyze", "--format", "json"], repo)).stdout);

    expect(second).toEqual(first);
  });
});
