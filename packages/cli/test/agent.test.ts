import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHighRiskRepo, createLowRiskRepo, createMediumRiskRepo, createNextRouteRiskRepo, createRepo, createTempDir, git, gitOutput, run, writeExecutionConfig, writeFile, writeLatestProductRunReport } from "./helpers";

describe("codedecay agent CLI contract", () => {
  it("renders API preflight guidance without requiring changed files", async () => {
    const repo = createPreflightRepo();
    writeFile(
      repo,
      ".codedecay/local/generated/src/app/api/users/route.ts",
      "export async function GET() { return Response.json({ local: true }); }\n"
    );

    const result = await run(
      ["agent", "preflight", "--task", "Add a GET /api/users export endpoint", "--format", "json"],
      repo
    );
    const preflight = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(preflight).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-preflight",
      task: "Add a GET /api/users export endpoint",
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(preflight.deterministicEvidence.taskSignals.noDiffRequired).toBe(true);
    expect(preflight.deterministicEvidence.likelyAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api"])
    );
    expect(preflight.deterministicEvidence.candidateFiles.map((file: { path: string }) => file.path)).toContain(
      "src/app/api/users/route.ts"
    );
    expect(
      preflight.deterministicEvidence.candidateFiles.some((file: { path: string }) =>
        file.path.startsWith(".codedecay/local/")
      )
    ).toBe(false);
    expect(preflight.deterministicEvidence.candidateRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "/api/users",
          kind: "api-route"
        })
      ])
    );
    expect(preflight.deterministicEvidence.memory.flows).toEqual([
      expect.objectContaining({
        title: "User export API"
      })
    ]);
    expect(preflight.deterministicEvidence.memory.invariants).toEqual([
      expect.objectContaining({
        title: "User export stays authorized"
      })
    ]);
    expect(preflight.deterministicEvidence.designConstraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "scope-fence",
          id: "api-work"
        })
      ])
    );
    expect(preflight.deterministicEvidence.configuredChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "configured-command",
          command: "pnpm test -- users",
          willRun: false
        })
      ])
    );
    expect(preflight.suggestions.proofPlan).toEqual(
      expect.arrayContaining([
        expect.stringContaining("API-level regression test")
      ])
    );
    expect(gitOutput(repo, ["status", "--porcelain"])).toBe("");
  });

  it("finds UI preflight routes and files", async () => {
    const repo = createPreflightRepo();

    const result = await run(
      ["agent", "preflight", "--task", "Update dashboard UI filter form", "--format", "json"],
      repo
    );
    const preflight = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(preflight.deterministicEvidence.likelyAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["ui"])
    );
    expect(preflight.deterministicEvidence.candidateFiles.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(["src/app/dashboard/page.tsx", "src/components/UserFilter.tsx"])
    );
    expect(preflight.deterministicEvidence.candidateRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "/dashboard",
          kind: "ui-route"
        })
      ])
    );
    expect(preflight.suggestions.proofPlan).toEqual(
      expect.arrayContaining([
        expect.stringContaining("user-flow/browser check")
      ])
    );
  });

  it("finds config preflight files and checks", async () => {
    const repo = createPreflightRepo();

    const result = await run(
      ["agent", "preflight", "--task", "Update CI workflow and tsconfig for typed build", "--format", "json"],
      repo
    );
    const preflight = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(preflight.deterministicEvidence.likelyAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["config"])
    );
    expect(preflight.deterministicEvidence.candidateFiles.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([".github/workflows/ci.yml", "tsconfig.json"])
    );
    expect(preflight.suggestions.proofPlan).toEqual(
      expect.arrayContaining([
        expect.stringContaining("config/CI/env path")
      ])
    );
  });

  it("finds test-only preflight proof guidance and renders markdown", async () => {
    const repo = createPreflightRepo();

    const result = await run(
      ["agent", "preflight", "--task", "Add Vitest regression tests for users API", "--format", "markdown"],
      repo
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Agent Preflight");
    expect(result.stdout).toContain("### Deterministic Repo Evidence");
    expect(result.stdout).toContain("### Suggestions For Agent");
    expect(result.stdout).toContain("No git diff required: yes");
    expect(result.stdout).toContain("src/api/users.test.ts");
    expect(result.stdout).toContain("Make the test prove real behavior");
    expect(result.stdout).toContain("LLM/model called by CodeDecay: no");
  });

  it("loads a local requirements artifact and exposes provenance before suggestions", async () => {
    const repo = createRepo({
      "src/billing/export.ts": "export function exportBilling() { return []; }\n",
      "packages/tool-adapters/src/openapi.ts": "export const openapi = true;\n",
      ".codedecay/requirements.yml": [
        "confidence: high",
        "acceptanceCriteria:",
        "  - id: AC-1",
        "    text: Authorized users can export billing rows as CSV.",
        "    requiredProof:",
        "      - Call the real billing export route.",
        "affectedFlows:",
        "  - name: Billing export",
        "    kind: api",
        ""
      ].join("\n")
    });

    const result = await run([
      "agent",
      "preflight",
      "--task",
      "Add a billing export API",
      "--requirements",
      ".codedecay/requirements.yml",
      "--format",
      "markdown"
    ], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("### Requirement Evidence");
    expect(result.stdout).toContain("AC-1: Authorized users can export billing rows as CSV.");
    expect(result.stdout).toContain(".codedecay/requirements.yml");
    expect(result.stdout.indexOf("### Requirement Evidence")).toBeLessThan(
      result.stdout.indexOf("### Suggestions For Agent")
    );
    expect(result.stdout).toContain("src/billing/export.ts");
    expect(result.stdout).not.toContain("packages/tool-adapters/src/openapi.ts");
  });

  it("rejects requirement artifacts outside the repository boundary", async () => {
    const repo = createPreflightRepo();
    const outside = createTempDir();
    const artifact = join(outside, "requirements.yml");
    writeFileSync(artifact, "acceptanceCriteria:\n  - must stay local\n");

    const result = await run([
      "agent",
      "preflight",
      "--task",
      "Update users API",
      "--requirements",
      artifact
    ], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--requirements must point to a file inside the repository");
  });

  it("loads acceptance criteria and flows from a Markdown requirements artifact", async () => {
    const repo = createRepo({
      "src/billing/export.ts": "export function exportBilling() { return []; }\n",
      "requirements.md": [
        "# Task",
        "Add a billing export API",
        "",
        "## Acceptance Criteria",
        "- AC-1: Authorized users can export billing rows.",
        "  - Proof: Call the real billing export route.",
        "",
        "## Affected Flows",
        "- api: Billing export",
        ""
      ].join("\n")
    });

    const result = await run([
      "agent", "preflight", "--task", "Add a billing export API",
      "--requirements", "requirements.md", "--format", "json"
    ], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.requirements.acceptanceCriteria[0]).toMatchObject({
      id: "AC-1",
      requiredProof: ["Call the real billing export route."]
    });
    expect(report.requirements.affectedFlows[0]).toMatchObject({ kind: "api", name: "Billing export" });
  });

  it("preserves requirements in a post-diff agent task bundle", async () => {
    const repo = createMediumRiskRepo();
    writeFile(repo, "requirements.json", JSON.stringify({
      acceptanceCriteria: [{
        id: "AC-1",
        text: "The users API keeps its response contract.",
        requiredProof: ["Call the changed users API."]
      }],
      affectedFlows: [{ name: "Users API", kind: "api" }]
    }));

    const result = await run([
      "agent", "--task", "Update the users API",
      "--requirements", "requirements.json", "--format", "json"
    ], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.requirements.acceptanceCriteria[0]).toMatchObject({
      id: "AC-1",
      requiredProof: ["Call the changed users API."]
    });
  });

  it("requires a task for preflight", async () => {
    const repo = createPreflightRepo();

    const result = await run(["agent", "preflight", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CodeDecay failed: agent preflight requires --task <description>.");
  });

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

  it("filters fix tasks and includes status plus scope contract evidence", async () => {
    const repo = createRepo({
      "codedecay.contract.json": JSON.stringify(
        {
          version: 1,
          activeScopeFence: "api-task",
          scopeFences: [
            {
              id: "api-task",
              allowedFiles: ["src/api/**"],
              allowedAreas: ["api"],
              severity: "high"
            }
          ]
        },
        null,
        2
      ),
      "docs/guide.md": "Original docs.\n",
      "src/api/users.ts": "export function listUsers() { return []; }\n"
    });
    writeFile(repo, "src/api/users.ts", "export function listUsers() { return [{ id: 'admin' }]; }\n");
    writeFile(repo, "docs/guide.md", "Changed docs.\n");

    const result = await run(
      [
        "agent",
        "--format",
        "json",
        "--filter-source",
        "finding",
        "--filter-priority",
        "high",
        "--filter-file",
        "docs/guide.md"
      ],
      repo
    );
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.status).toBe("tasks-remaining");
    expect(bundle.taskFilters).toEqual({
      source: "finding",
      priority: "high",
      file: "docs/guide.md"
    });
    expect(bundle.summary.fixTasks).toBe(1);
    expect(bundle.summary.totalFixTasks).toBeGreaterThan(bundle.summary.fixTasks);
    expect(bundle.summary.contractFindings).toBe(1);
    expect(bundle.evidence.contractFindings).toEqual([
      expect.objectContaining({
        ruleId: "contract-scope-fence",
        file: "docs/guide.md",
        severity: "high"
      })
    ]);
    expect(bundle.tasks).toEqual([
      expect.objectContaining({
        source: "finding",
        priority: "high",
        file: "docs/guide.md",
        scope: expect.objectContaining({
          files: ["docs/guide.md"],
          areas: ["docs"]
        })
      })
    ]);
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

function createPreflightRepo(): string {
  return createRepo({
    ".gitignore": ".codedecay/local/\n",
    ".codedecay/config.yml": [
      "version: 1",
      "commands:",
      "  test:",
      "    - pnpm test -- users",
      "  build:",
      "    - pnpm build",
      "toolAdapters:",
      "  playwright:",
      "    enabled: true",
      "    command: pnpm exec playwright test",
      "productTesting:",
      "  targets:",
      "    api:",
      "      apiEndpoints:",
      "        - id: users-list",
      "          method: GET",
      "          path: /api/users",
      ""
    ].join("\n"),
    ".codedecay/memory.json": JSON.stringify(
      {
        version: 1,
        flows: [
          {
            name: "User export API",
            description: "Exported users must match the documented API response.",
            areas: ["api"],
            productPaths: ["/api/users"]
          }
        ],
        commands: [
          {
            name: "Users API tests",
            command: "pnpm test -- users",
            areas: ["api", "test"]
          }
        ],
        invariants: [
          {
            name: "User export stays authorized",
            description: "Only authorized staff can export user records.",
            severity: "high",
            areas: ["api", "auth"],
            productPaths: ["/api/users"]
          }
        ],
        architecture: [
          {
            title: "Dashboard UI owns user filters",
            note: "Dashboard filter UI should stay in components instead of API handlers.",
            areas: ["ui"],
            files: ["src/components/**"]
          }
        ],
        regressions: [
          {
            title: "CI skipped typed build",
            description: "A prior workflow change skipped typecheck on package changes.",
            severity: "medium",
            areas: ["config"],
            files: [".github/workflows/**"]
          }
        ]
      },
      null,
      2
    ),
    ".github/workflows/ci.yml": "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
    "codedecay.contract.json": JSON.stringify(
      {
        version: 1,
        activeScopeFence: "api-work",
        scopeFences: [
          {
            id: "api-work",
            allowedFiles: ["src/app/api/**", "src/api/**"],
            allowedAreas: ["api", "test"],
            severity: "high"
          },
          {
            id: "ui-work",
            allowedFiles: ["src/app/**", "src/components/**"],
            allowedAreas: ["ui", "test"],
            severity: "medium"
          }
        ],
        boundaryRules: [
          {
            id: "ui-no-db",
            from: { areas: ["ui"] },
            disallow: { areas: ["database"] },
            severity: "high",
            message: "UI code must not import persistence directly."
          }
        ]
      },
      null,
      2
    ),
    "package.json": JSON.stringify({ scripts: { test: "vitest", build: "tsc -p tsconfig.json" } }, null, 2),
    "src/api/users.test.ts": "import { describe, it, expect } from 'vitest';\ndescribe('users api', () => { it('works', () => expect(true).toBe(true)); });\n",
    "src/app/api/users/route.ts": "export async function GET() { return Response.json([]); }\n",
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Dashboard</main>; }\n",
    "src/components/UserFilter.tsx": "export function UserFilter() { return <form />; }\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }, null, 2)
  });
}
