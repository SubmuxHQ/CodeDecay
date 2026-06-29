import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createHighRiskRepo,
  createLowRiskRepo,
  createMediumRiskRepo,
  createNextjsExampleRepo,
  createNodeApiExampleRepo,
  createRepo,
  createTempDir,
  currentCliVersion,
  ensureBuiltCli,
  git,
  gitOutput,
  repoRoot,
  runBuilt,
  writeFile
} from "./helpers/built-cli";

beforeAll(ensureBuiltCli);

describe("built codedecay CLI redteam and agent workflows", () => {
  it("runs redteam reports from the built CLI without executing configured commands", () => {
    const repo = createMediumRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        "toolAdapters:",
        "  playwright: true",
        "  pact:",
        "    command: pnpm run pact:verify",
        ""
      ].join("\n")
    );
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const json = runBuilt(["redteam", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(json.stdout);

    expect(json.status).toBe(0);
    expect(report).toMatchObject({
      tool: "CodeDecay",
      mode: "deterministic",
      safety: {
        commandsExecuted: false,
        llmCalled: false
      }
    });
    expect(report.configuredChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "test", willRun: false })])
    );
    expect(report.toolAdapterPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          command: "pnpm exec playwright test",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "pact",
          command: "pnpm run pact:verify",
          willRun: false,
          requiresApproval: false
        })
      ])
    );
    expect(report.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill"
      })
    ]);
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    expect(runBuilt(["redteam", "--cwd", repo, "--fail-on", "high"]).status).toBe(0);
    expect(runBuilt(["redteam", "--cwd", repo, "--fail-on", "medium"]).status).toBe(1);
  });

  it("runs agent task bundles from the built CLI without executing configured commands", () => {
    const repo = createMediumRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\"",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        "toolAdapters:",
        "  playwright: true",
        ""
      ].join("\n")
    );

    const result = runBuilt(["agent", "--cwd", repo, "--format", "json"]);
    const bundle = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      prompt: expect.stringContaining("CodeDecay agent task bundle"),
      safety: {
        commandsExecuted: false,
        llmCalled: false
      }
    });
    expect(bundle.suggestedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "configured-command",
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
  });

  it("supports agent handoff profiles from the built CLI", () => {
    const repo = createMediumRiskRepo();

    const result = runBuilt(["agent", "--cwd", repo, "--profile", "opencode", "--format", "json"]);
    const bundle = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(bundle.agentProfile).toMatchObject({
      id: "opencode",
      name: "OpenCode"
    });
    expect(bundle.prompt).toContain("Target agent profile: OpenCode");

    const help = runBuilt(["help", "agent"]);

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--profile <profile>");
    expect(help.stdout).toContain("generic, codex, claude-code, cursor, pi, opencode, desktop");
  });

  it("runs the Node API example redteam, agent, and execute workflow from the built CLI", () => {
    const repo = createNodeApiExampleRepo();

    const redteam = runBuilt(["redteam", "--cwd", repo, "--format", "json"]);
    const redteamReport = JSON.parse(redteam.stdout);

    expect(redteam.status).toBe(0);
    expect(redteamReport.summary.riskLevel).toBe("high");
    expect(redteamReport.toolAdapterPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          command: "node scripts/user-flow-smoke.mjs",
          willRun: false
        }),
        expect.objectContaining({
          kind: "pact",
          command: "node scripts/pact-verify.mjs",
          willRun: false
        })
      ])
    );

    const agent = runBuilt(["agent", "--cwd", repo, "--format", "json"]);
    const agentBundle = JSON.parse(agent.stdout);

    expect(agent.status).toBe(0);
    expect(agentBundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high"
      },
      safety: {
        commandsExecuted: false,
        llmCalled: false,
        telemetrySent: false,
        cloudDependency: false
      }
    });
    expect(agentBundle.evidence.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api", "auth", "database", "config"])
    );
    expect(agentBundle.tasks.length).toBeGreaterThan(0);

    const execute = runBuilt(["execute", "--cwd", repo, "--format", "json"]);
    const executeReport = JSON.parse(execute.stdout);

    expect(execute.status).toBe(1);
    expect(executeReport.summary).toMatchObject({
      status: "failed",
      total: 3,
      passed: 2,
      failed: 1
    });
    expect(executeReport.results).toEqual([
      expect.objectContaining({
        kind: "test",
        status: "passed",
        stdout: "unit smoke passed\n"
      })
    ]);
    expect(executeReport.toolAdapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          status: "passed",
          summary: "Playwright checks passed."
        }),
        expect.objectContaining({
          kind: "pact",
          status: "failed",
          failure: expect.objectContaining({
            mode: "nonzero-exit"
          }),
          evidence: expect.arrayContaining([
            expect.objectContaining({
              kind: "contract",
              severity: "high"
            })
          ])
        })
      ])
    );
  });

  it("runs the Next.js example analyze and agent workflow from the built CLI", () => {
    const repo = createNextjsExampleRepo();

    const analyze = runBuilt(["analyze", "--cwd", repo, "--format", "json"]);
    const analysisReport = JSON.parse(analyze.stdout);

    expect(analyze.status).toBe(0);
    expect(analysisReport.summary.riskLevel).toBe("high");
    expect(analysisReport.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api", "auth", "database", "config", "ui"])
    );
    expect(analysisReport.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard"
        })
      ])
    );

    const agent = runBuilt(["agent", "--cwd", repo, "--format", "json"]);
    const agentBundle = JSON.parse(agent.stdout);

    expect(agent.status).toBe(0);
    expect(agentBundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high",
        impactedRoutes: 2,
        missingTestFindings: expect.any(Number)
      },
      safety: {
        commandsExecuted: false,
        llmCalled: false
      }
    });
    expect(agentBundle.evidence.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard"
        })
      ])
    );
    expect(agentBundle.summary.missingTestFindings).toBeGreaterThan(0);
    expect(agentBundle.prompt).toContain("2 route/API impacts");
    expect(agentBundle.prompt).toContain("missing-test findings");
    expect(agentBundle.prompt).toContain("Start with impacted routes/APIs when present");
    expect(agentBundle.instructions).toContain(
      "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings."
    );
    expect(agentBundle.evidence.edgeCases).toEqual(
      expect.arrayContaining([
        "Exercise the real API route with malformed, missing, and boundary-value payloads.",
        "Check loading, empty, error, and permission-denied UI states."
      ])
    );
  });
});
