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

beforeAll(ensureBuiltCli, 120_000);

describe("built codedecay CLI redteam and agent workflows", () => {
  it("renders requirement trace JSON and Markdown from the built CLI", () => {
    const repo = createRepo({
      "src/api/users.ts": "export const users = () => [];\n",
      "requirements.json": JSON.stringify({
        acceptanceCriteria: [
          { id: "AC-USERS", text: "Users API returns active users.", requiredProof: ["API integration proof."] },
          { id: "AC-BILLING", text: "Billing refunds remain available." }
        ],
        affectedFlows: [{ name: "Users API", kind: "api" }]
      })
    });
    writeFile(repo, "src/api/users.ts", "export const users = () => [{ id: 1, active: true }];\n");

    const args = [
      "--cwd", repo,
      "--task", "Update users API",
      "--requirements", "requirements.json"
    ];
    const json = runBuilt(["analyze", ...args, "--format", "json"]);
    const markdown = runBuilt(["redteam", ...args, "--format", "markdown"]);
    const trace = JSON.parse(json.stdout).requirementTrace;

    expect(json.status).toBe(0);
    expect(trace.criteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ requirementId: "AC-USERS", status: "proof-missing" }),
      expect.objectContaining({ requirementId: "AC-BILLING", status: "unmapped" })
    ]));
    expect(markdown.status).toBe(0);
    expect(markdown.stdout).toContain("### Acceptance Criteria Trace");
    expect(markdown.stdout).toContain("| AC-USERS | Proof missing |");
    expect(markdown.stdout).toContain("| AC-BILLING | Unmapped |");
  });

  it("supports explicit investigation with deterministic fallback in the built CLI", () => {
    const repo = createMediumRiskRepo();

    const result = runBuilt(["agent", "--cwd", repo, "--investigate", "--format", "json"]);
    const bundle = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(bundle.investigation).toMatchObject({
      status: "disabled",
      suggestions: [],
      llmCalled: false,
      untrusted: true
    });
    expect(bundle.summary.changedFiles).toBeGreaterThan(0);
    expect(bundle.safety.llmCalled).toBe(false);
  });

  it("loads structured requirements in built agent preflight", () => {
    const repo = createRepo({
      "src/billing/export.ts": "export function exportBilling() { return []; }\n",
      "packages/tool-adapters/src/openapi.ts": "export const openapi = true;\n",
      ".codedecay/requirements.json": JSON.stringify({
        confidence: "high",
        acceptanceCriteria: [{
          id: "AC-1",
          text: "Authorized users can export billing rows.",
          requiredProof: ["Call the real billing export route."]
        }],
        affectedFlows: [{ name: "Billing export", kind: "api" }]
      })
    });

    const result = runBuilt([
      "agent",
      "preflight",
      "--cwd",
      repo,
      "--task",
      "Add a billing export API",
      "--requirements",
      ".codedecay/requirements.json",
      "--format",
      "json"
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.requirements.acceptanceCriteria[0]).toMatchObject({ id: "AC-1" });
    expect(report.deterministicEvidence.candidateFiles.map((file: { path: string }) => file.path)).toEqual([
      "src/billing/export.ts"
    ]);
    expect(report.summary).toMatchObject({ confidence: "high", insufficientContext: false });
  });

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

  it("keeps editable memory visible without changing built CLI risk or executing memory commands", () => {
    const baselineFiles = {
      "src/auth/session.ts": "export function session(token?: string) { return Boolean(token); }\n"
    };
    const withoutMemoryRepo = createRepo(baselineFiles);
    const withMemoryRepo = createRepo({
      ...baselineFiles,
      ".codedecay/memory.json": JSON.stringify(
        {
          version: 1,
          flows: [],
          commands: [
            {
              name: "Untrusted command",
              command: "node -e \"require('fs').writeFileSync('memory-command-ran.txt','yes')\"",
              areas: ["auth"]
            }
          ],
          invariants: [
            {
              name: "Editable invariant",
              description: "This editable context must not become scoring proof.",
              severity: "high",
              areas: ["auth"]
            }
          ],
          architecture: [],
          regressions: [
            {
              title: "Editable regression",
              description: "This editable regression must not become scoring proof.",
              severity: "high",
              areas: ["auth"]
            }
          ]
        },
        null,
        2
      )
    });
    const changedSource = [
      "export function session(token?: string) {",
      "  if (!token) return false;",
      "  return token.length > 8;",
      "}",
      ""
    ].join("\n");
    writeFile(withoutMemoryRepo, "src/auth/session.ts", changedSource);
    writeFile(withMemoryRepo, "src/auth/session.ts", changedSource);

    const withoutMemory = JSON.parse(runBuilt(["analyze", "--cwd", withoutMemoryRepo, "--format", "json"]).stdout);
    const withMemory = JSON.parse(runBuilt(["analyze", "--cwd", withMemoryRepo, "--format", "json"]).stdout);

    expect(withMemory.summary.mergeRiskScore).toBe(withoutMemory.summary.mergeRiskScore);
    expect(withMemory.summary.riskLevel).toBe(withoutMemory.summary.riskLevel);
    expect(withMemory.findings.map((finding: { ruleId: string }) => finding.ruleId)).toEqual(
      expect.arrayContaining(["memory-invariant-impacted", "memory-past-regression-area"])
    );
    expect(withMemory.summary.mergeRiskBreakdown.contributors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "memory-invariant-impacted",
          evidence: "memory-context",
          points: 0
        }),
        expect.objectContaining({
          ruleId: "memory-past-regression-area",
          evidence: "memory-context",
          points: 0
        })
      ])
    );
    expect(withMemory.recommendedTests).toContain("Run project command: Untrusted command (node -e \"require('fs').writeFileSync('memory-command-ran.txt','yes')\")");
    expect(existsSync(join(withMemoryRepo, "memory-command-ran.txt"))).toBe(false);
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
