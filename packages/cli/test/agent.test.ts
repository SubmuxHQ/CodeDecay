import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHighRiskRepo, createLowRiskRepo, createMediumRiskRepo, createNextRouteRiskRepo, createRepo, createTempDir, git, gitOutput, run, writeExecutionConfig, writeFile, writeLatestProductRunReport } from "./helpers";

describe("codedecay agent CLI contract", () => {
  it("renders deterministic JSON and markdown agent task bundles", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
      toolAdapters: true
    });
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const json = await run(["agent", "--format", "json"], repo);
    const bundle = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high"
      },
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(bundle.purpose).toContain("Codex");
    expect(bundle.agentProfile).toMatchObject({
      id: "generic",
      name: "Generic user-owned agent"
    });
    expect(bundle.evidence.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api", "auth"])
    );
    expect(bundle.suggestedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "configured-command",
          command: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
          willRun: false
        }),
        expect.objectContaining({
          source: "tool-adapter",
          kind: "playwright",
          willRun: false
        })
      ])
    );
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    const markdown = await run(["agent", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Agent Task Bundle");
    expect(markdown.stdout).toContain("### Instructions For The Agent");
    expect(markdown.stdout).toContain("### Agent Handoff");
    expect(markdown.stdout).toContain("### Tool Evidence");
    expect(markdown.stdout).toContain("### Safety And Limits");
    expect(markdown.stdout).toContain("LLM/model called by CodeDecay: no");
  });

  it("includes concrete route/API impacts in agent task bundles", async () => {
    const repo = createNextRouteRiskRepo();

    const json = await run(["agent", "--format", "json"], repo);
    const bundle = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(bundle.summary.impactedRoutes).toBe(2);
    expect(bundle.summary.missingTestFindings).toBeGreaterThan(0);
    expect(bundle.evidence.impactedRoutes).toEqual(
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
    expect(bundle.prompt).toContain("2 route/API impacts");
    expect(bundle.prompt).toContain("missing-test findings");
    expect(bundle.prompt).toContain("Start with impacted routes/APIs when present");
    expect(bundle.instructions).toContain(
      "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings."
    );

    const markdown = await run(["agent", "--format", "markdown"], repo);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("| Missing-test findings |");
    expect(markdown.stdout).toContain("Start from impacted routes/APIs when present");
    expect(markdown.stdout).toContain("Impacted routes and APIs:");
    expect(markdown.stdout).toContain("High `GET, POST /api/users` (Next.js API route)");
    expect(markdown.stdout).toContain("Medium `/dashboard` (Next.js UI route)");
  });

  it("includes product verification tasks from latest product artifacts", async () => {
    const repo = createMediumRiskRepo();
    writeLatestProductRunReport(repo);

    const result = await run(["agent", "--profile", "codex", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.agentProfile).toMatchObject({
      id: "codex",
      name: "Codex"
    });
    expect(bundle.summary.productFailureBundles).toBe(1);
    expect(bundle.evidence.productFailureBundles[0]).toMatchObject({
      checkId: "api-get-users",
      checkKind: "api",
      rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
    });
    expect(bundle.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "product-failure",
          title: expect.stringContaining("Fix product failure")
        })
      ])
    );
    expect(bundle.prompt).toContain("1 product failure bundles");
  });

  it("supports agent handoff profiles and rejects invalid profiles", async () => {
    const repo = createMediumRiskRepo();

    const codex = await run(["agent", "--profile", "codex", "--format", "json"], repo);
    const codexBundle = JSON.parse(codex.stdout);

    expect(codex.exitCode).toBe(0);
    expect(codexBundle.agentProfile).toMatchObject({
      id: "codex",
      name: "Codex"
    });
    expect(codexBundle.prompt).toContain("Target agent profile: Codex");

    const cursor = await run(["agent", "--profile=cursor", "--format", "markdown"], repo);

    expect(cursor.exitCode).toBe(0);
    expect(cursor.stdout).toContain("### Agent Handoff");
    expect(cursor.stdout).toContain("Cursor");

    const pi = await run(["agent", "--profile", "pi", "--format", "json"], repo);
    const piBundle = JSON.parse(pi.stdout);

    expect(pi.exitCode).toBe(0);
    expect(piBundle.agentProfile).toMatchObject({
      id: "pi",
      name: "Pi"
    });
    expect(piBundle.prompt).toContain("Target agent profile: Pi");

    const opencode = await run(["agent", "--profile=opencode", "--format", "json"], repo);
    const opencodeBundle = JSON.parse(opencode.stdout);

    expect(opencode.exitCode).toBe(0);
    expect(opencodeBundle.agentProfile).toMatchObject({
      id: "opencode",
      name: "OpenCode"
    });
    expect(opencodeBundle.prompt).toContain("Target agent profile: OpenCode");

    const invalid = await run(["agent", "--profile", "unknown-agent", "--format", "json"], repo);

    expect(invalid.exitCode).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain(
      "CodeDecay failed: Invalid agent profile \"unknown-agent\". Expected generic, codex, claude-code, cursor, pi, opencode, desktop."
    );
  });

  it("uses --cwd and writes relative --output paths from that cwd", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["agent", "--cwd", repo, "--format", "json", "--output", "codedecay-agent.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-agent.json");
    const bundle = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(bundle.mode).toBe("agent-task-bundle");
    expect(bundle.evidence.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(bundle.summary.riskLevel).toBe("medium");
  });

  it("uses base/head refs", async () => {
    const repo = createRepo({
      "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(repo, "src/api/users.ts", "export function handler() { return Response.json({ ok: false }); }\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "change api"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const result = await run(["agent", "--base", base, "--head", head, "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.evidence.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
  });

  it("fails clearly for agent git errors without emitting a bundle", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["agent", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
  });
});
