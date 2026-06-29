import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHighRiskRepo, createLowRiskRepo, createMediumRiskRepo, createNextRouteRiskRepo, createRepo, createTempDir, git, gitOutput, run, writeExecutionConfig, writeFile } from "./helpers";

describe("codedecay redteam CLI contract", () => {
  it("renders deterministic JSON and markdown redteam reports", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
      toolAdapters: true
    });
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const json = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(report.tool).toBe("CodeDecay");
    expect(report.mode).toBe("deterministic");
    expect(report.summary.riskLevel).toBe("high");
    expect(Object.values(report.safety).filter((value) => value === false)).toHaveLength(4);
    expect(report.edgeCases).toContain("Check missing, expired, malformed, and privilege-escalation credentials.");
    expect(report.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        summary: "Find missed PR risks."
      })
    ]);
    expect(report.configuredChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "test", willRun: false })])
    );
    expect(report.toolAdapterPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "schemathesis",
          command: "st run docs/openapi.yaml --url http://127.0.0.1:4000",
          willRun: false,
          requiresApproval: false
        })
      ])
    );
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    const markdown = await run(["redteam", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Redteam Report");
    expect(markdown.stdout).toContain("### What Could Break");
    expect(markdown.stdout).toContain("### Tool Adapter Plans");
    expect(markdown.stdout).toContain("### Tasks For Your Coding Agent");
    expect(markdown.stdout).toContain("LLM/model called: no");
  });

  it("includes concrete route/API impacts in redteam reports", async () => {
    const repo = createNextRouteRiskRepo();

    const json = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(report.summary.impactedRoutes).toBe(2);
    expect(report.analysis.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"]
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard",
          methods: []
        })
      ])
    );

    const markdown = await run(["redteam", "--format", "markdown"], repo);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("### Likely Impacted Routes And APIs");
    expect(markdown.stdout).toContain("High `GET, POST /api/users` (Next.js API route)");
    expect(markdown.stdout).toContain("Medium `/dashboard` (Next.js UI route)");
  });

  it("uses --cwd and writes relative --output paths from that cwd", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["redteam", "--cwd", repo, "--format", "json", "--output", "codedecay-redteam.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-redteam.json");
    const report = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(report.changedFiles).toBeUndefined();
    expect(report.analysis.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(report.summary.riskLevel).toBe("medium");
  });

  it("uses base/head refs and fail-on thresholds", async () => {
    const repo = createRepo({
      "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(
      repo,
      "src/api/users.ts",
      [
        "export function handler(req: Request) {",
        "  if (req.method === \"POST\") return Response.json({ ok: true });",
        "  return Response.json({ ok: false });",
        "}",
        ""
      ].join("\n")
    );
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "change api"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const pass = await run(["redteam", "--base", base, "--head", head, "--fail-on", "high"], repo);
    const fail = await run(["redteam", "--base", base, "--head", head, "--fail-on", "medium"], repo);
    const json = await run(["redteam", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(json.stdout);

    expect(pass.exitCode).toBe(0);
    expect(fail.exitCode).toBe(1);
    expect(report.base).toBe(base);
    expect(report.head).toBe(head);
    expect(report.analysis.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
  });

  it("fails clearly for redteam git errors without emitting a low-risk report", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["redteam", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
  });
});
