import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDifferentialRepo, createHighRiskRepo, createLowRiskRepo, createMediumRiskRepo, createNextRouteRiskRepo, createRepo, createTempDir, git, gitOutput, run, writeExecutionConfig, writeFile } from "./helpers";

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
    expect(report.summary.verificationStatus).toBe("not-run");
    expect(report.verification).toMatchObject({
      status: "not-run",
      commandsExecuted: false,
      total: 0
    });
    expect(Object.values(report.safety).filter((value) => value === false)).toHaveLength(4);
    expect(report.edgeCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "auth-fail-closed",
          trigger: expect.stringMatching(/missing.*expired.*lower-privilege/i),
          proof: expect.objectContaining({ kind: "api-integration" })
        })
      ])
    );
    expect(report.edgeCases.every((scenario: unknown) => typeof scenario === "object")).toBe(true);
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
    expect(markdown.stdout).toContain("### Verification Evidence");
    expect(markdown.stdout).toContain("### Ranked Behavior Scenarios");
    expect(markdown.stdout).toContain("Expected invariant:");
    expect(markdown.stdout).toContain("**Status:** Not run");
    expect(markdown.stdout).toContain("### Tasks For Your Coding Agent");
    expect(markdown.stdout).toContain("LLM/model called: no");
  });

  it("runs configured checks only when --with-checks is requested", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes'); console.log('checked')\""
    });

    const reportOnly = await run(["redteam", "--format", "json"], repo);
    const reportOnlyJson = JSON.parse(reportOnly.stdout);

    expect(reportOnly.exitCode).toBe(0);
    expect(reportOnlyJson.summary.verificationStatus).toBe("not-run");
    expect(reportOnlyJson.safety.commandsExecuted).toBe(false);
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    const verified = await run(["redteam", "--with-checks", "--format", "json"], repo);
    const verifiedJson = JSON.parse(verified.stdout);

    expect(verified.exitCode).toBe(0);
    expect(verifiedJson.summary.verificationStatus).toBe("verified");
    expect(verifiedJson.verification).toMatchObject({
      status: "verified",
      commandsExecuted: true,
      total: 1,
      passed: 1
    });
    expect(verifiedJson.verification.checks[0]).toMatchObject({
      kind: "test",
      status: "passed",
      proof: "tool-evidence",
      summary: "checked"
    });
    expect(verifiedJson.safety.commandsExecuted).toBe(true);
    expect(readFileSync(join(repo, "codedecay-ran.txt"), "utf8")).toBe("yes");

    const markdown = await run(["redteam", "--with-checks", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("**Status:** Verified");
    expect(markdown.stdout).toContain("proof: Tool evidence");
    expect(markdown.stdout).toContain("Commands executed: yes");
  });

  it("rejects assertion-free top-level smoke proof when differential execution exposes a regression", async () => {
    const repo = createRepo({
      "package.json": JSON.stringify({ type: "module", scripts: { test: "node test/unit.js" } }, null, 2),
      "src/session.js": "export function getSession(id) { return { id }; }\n",
      "test/unit.js": [
        "import assert from 'node:assert/strict';",
        "import { getSession } from '../src/session.js';",
        "assert.equal(getSession('user-1').id, 'user-1');",
        ""
      ].join("\n"),
      "probe.js": [
        "import { getSession } from './src/session.js';",
        "console.log(JSON.stringify({ session: getSession('user-1') }));",
        ""
      ].join("\n"),
      ".codedecay/config.yml": [
        "version: 1",
        "commands:",
        "  test:",
        "    - node test/unit.js",
        "probes:",
        "  - name: session behavior",
        "    command: node probe.js",
        "    timeoutMs: 1000",
        "safety:",
        "  commandTimeoutMs: 1000",
        "  allowCommands: true",
        ""
      ].join("\n")
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    writeFile(repo, "src/session.js", "export function getSession() { return null; }\n");
    writeFile(
      repo,
      "test/unit.js",
      [
        "import { getSession } from '../src/session.js';",
        "const session = getSession('user-1');",
        "console.log('session smoke', session);",
        ""
      ].join("\n")
    );
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "regress session behavior with assertion-free smoke test"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const result = await run(["redteam", "--with-checks", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);
    const testCheck = report.verification.checks.find((check: { kind: string }) => check.kind === "test");
    const differentialCheck = report.verification.checks.find(
      (check: { name: string }) => check.name === "Differential: Probe: session behavior"
    );

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      weakTestFindings: 1,
      testProofStatus: "weak",
      verificationStatus: "failed"
    });
    expect(report.weakTestFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-without-assertions",
          file: "test/unit.js",
          description: expect.stringContaining("may only prove the file runs")
        })
      ])
    );
    expect(testCheck).toMatchObject({ status: "passed", proof: "tool-evidence" });
    expect(differentialCheck).toMatchObject({
      status: "failed",
      differentialStatus: "changed",
      proof: "tool-evidence"
    });
  });

  it("includes base/head differential probe evidence when --with-checks has refs", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: true });

    const result = await run(["redteam", "--with-checks", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);
    const differentialCheck = report.verification.checks.find((check: { name: string }) =>
      check.name === "Differential: Probe: value probe"
    );

    expect(result.exitCode).toBe(1);
    expect(report.summary.verificationStatus).toBe("failed");
    expect(report.verification.total).toBe(2);
    expect(report.verification.notes).toContain(
      "Base/head differential probe behavior changed. Treat this as tool evidence to review before merge."
    );
    expect(differentialCheck).toMatchObject({
      kind: "probe",
      status: "failed",
      proof: "tool-evidence",
      differentialStatus: "changed",
      differences: ['structured stdout changed at value: "base" -> "head"'],
      rerunCommand: `npx codedecay differential --base ${base} --head ${head} --format markdown`
    });
    expect(differentialCheck.artifacts.directory).toContain(".codedecay/local/differential/");
    expect(existsSync(join(repo, differentialCheck.artifacts.baseResult))).toBe(true);
    expect(existsSync(join(repo, differentialCheck.artifacts.headResult))).toBe(true);
    expect(report.fixTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Fix failing proof check: Differential: Probe: value probe",
          proof: "tool-evidence",
          source: "configured-check"
        })
      ])
    );

    const markdown = await run(["redteam", "--with-checks", "--base", base, "--head", head, "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(1);
    expect(markdown.stdout).toContain("Differential: Probe: value probe");
    expect(markdown.stdout).toContain("Differential status: changed");
    expect(markdown.stdout).toContain("Rerun: `npx codedecay differential");
    expect(markdown.stdout).toContain("Artifacts: `.codedecay/local/differential/");
  });

  it("includes base/head API contract evidence when --with-checks has refs", async () => {
    const { repo, base, head } = createRedteamApiContractRepo();

    const result = await run(["redteam", "--with-checks", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);
    const apiContractCheck = report.verification.checks.find((check: { name: string }) =>
      check.name === "API contract: docs/openapi.json"
    );

    expect(result.exitCode).toBe(1);
    expect(report.summary.verificationStatus).toBe("failed");
    expect(report.verification).toMatchObject({
      total: 1,
      failed: 1,
      commandsExecuted: false
    });
    expect(report.verification.notes).toContain(
      "No configured execution commands ran; verification includes base/head API contract evidence."
    );
    expect(report.verification.notes).toContain(
      "Base/head API contract contains breaking changes. Run Schemathesis, Pact, or client contract tests for the impacted routes before merge."
    );
    expect(apiContractCheck).toMatchObject({
      kind: "api-contract",
      status: "failed",
      proof: "tool-evidence",
      differentialStatus: "changed",
      differences: ["breaking removed-path: Removed API path /users."],
      rerunCommand: `npx codedecay differential --base ${base} --head ${head} --format markdown`
    });
    expect(report.fixTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Fix failing proof check: API contract: docs/openapi.json",
          proof: "tool-evidence",
          source: "configured-check"
        })
      ])
    );

    const markdown = await run(["redteam", "--with-checks", "--base", base, "--head", head, "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(1);
    expect(markdown.stdout).toContain("API contract: docs/openapi.json");
    expect(markdown.stdout).toContain("Run Schemathesis, Pact, or client contract tests");
    expect(markdown.stdout).toContain("breaking removed-path: Removed API path /users.");
  });

  it("marks --with-checks reports unverified when configured checks are skipped by safety config", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: false,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\""
    });

    const result = await run(["redteam", "--with-checks", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary.verificationStatus).toBe("unverified");
    expect(report.verification).toMatchObject({
      status: "unverified",
      commandsExecuted: false,
      total: 1,
      skipped: 1
    });
    expect(report.verification.checks[0]).toMatchObject({
      status: "skipped",
      proof: "missing-proof"
    });
    expect(report.safety.commandsExecuted).toBe(false);
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);
  });

  it("marks --with-checks reports blocked when safety policy rejects configured commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "rm -rf ./dist"
    });

    const result = await run(["redteam", "--with-checks", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary.verificationStatus).toBe("blocked");
    expect(report.verification).toMatchObject({
      status: "blocked",
      commandsExecuted: false,
      total: 1,
      blocked: 1,
      skipped: 0
    });
    expect(report.verification.checks[0]).toMatchObject({
      status: "blocked",
      proof: "missing-proof",
      failure: "Command was blocked by CodeDecay safety policy: recursive or forced file deletion."
    });
    expect(report.fixTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Resolve blocked proof check: Test command 1",
          proof: "missing-proof",
          source: "configured-check"
        })
      ])
    );
    expect(report.safety.commandsExecuted).toBe(false);
  });

  it("does not generate PR-specific redteam work when the repo has no diff", async () => {
    const repo = createRepo({
      "README.md": "# Project\n"
    });

    const result = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      changedFiles: 0,
      edgeCases: 0,
      fixTasks: 0,
      patternInsights: 0,
      verificationStatus: "not-run"
    });
    expect(report.edgeCases).toEqual([]);
    expect(report.fixTasks).toEqual([]);

    const markdown = await run(["redteam", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("No changed files were detected.");
    expect(markdown.stdout).toContain("No coding-agent fix tasks were generated.");
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

  it("includes design contract findings as redteam fix tasks", async () => {
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

    const result = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.analysis.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-scope-fence",
          file: "src/api/users.ts"
        })
      ])
    );
    expect(report.fixTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Investigate Change exceeds design contract scope fence",
          source: "finding",
          file: "src/api/users.ts"
        })
      ])
    );
  });

  it("keeps investigation opt-in and records provider limitations", async () => {
    const repo = createHighRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-test",
        "  timeoutMs: 10",
        ""
      ].join("\n")
    );

    const deterministic = await run(["redteam", "--format", "json"], repo);
    const deterministicReport = JSON.parse(deterministic.stdout);

    expect(deterministic.exitCode).toBe(0);
    expect(deterministic.stderr).toBe("");
    expect(deterministicReport.investigation).toBeUndefined();
    expect(deterministicReport.safety.llmCalled).toBe(false);

    const investigated = await run(["redteam", "--investigate", "--format", "json"], repo);
    const investigatedReport = JSON.parse(investigated.stdout);

    expect(investigated.exitCode).toBe(0);
    expect(investigated.stderr).toBe("");
    expect(investigatedReport.investigation).toMatchObject({
      status: "failed",
      provider: {
        configuredProvider: "litellm"
      },
      suggestions: [],
      llmCalled: false,
      untrusted: true
    });
    expect(investigatedReport.investigation.limitations[0]).toContain("LiteLLM provider requires llm.endpoint");
    expect(investigatedReport.safety.llmCalled).toBe(false);
  });

  it("fails clearly for redteam git errors without emitting a low-risk report", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["redteam", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
  });
});

function createRedteamApiContractRepo(): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "docs/openapi.json": redteamOpenApiDocument({
      "/users": {
        get: {
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["id"],
                    properties: {
                      id: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }),
    ".codedecay/config.yml": [
      "version: 1",
      "commands: {}",
      "apiContracts:",
      "  openapi:",
      "    - docs/openapi.json",
      "safety:",
      "  allowCommands: false",
      ""
    ].join("\n")
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "docs/openapi.json", redteamOpenApiDocument({}));
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "remove users contract"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function redteamOpenApiDocument(paths: Record<string, unknown>): string {
  return `${JSON.stringify({
    openapi: "3.0.0",
    info: {
      title: "Fixture API",
      version: "1.0.0"
    },
    paths
  }, null, 2)}\n`;
}
