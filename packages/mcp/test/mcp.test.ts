import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCodeDecayMcpServer,
  runAnalyzePrTool,
  runAgentTaskBundleTool,
  runAuditTestsTool,
  runExecuteConfiguredChecksTool,
  runImpactMapTool,
  runProductFailuresTool,
  runProductPlanTool,
  runProductRerunTool,
  runProductRunTool,
  runRedteamReportTool,
  runSuggestEdgeCasesTool
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CodeDecay MCP tools", () => {
  it("creates an MCP server", () => {
    const server = createCodeDecayMcpServer({ cwd: createTempDir() });

    expect(server).toBeTruthy();
  });

  it("returns a markdown PR analysis", () => {
    const repo = createWeakTestRepo();

    const output = runAnalyzePrTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Report");
    expect(output).toContain("Changed test has no assertions");
  });

  it("returns an impact map", () => {
    const repo = createRouteImpactRepo();

    const output = JSON.parse(runImpactMapTool({ cwd: repo }, {}));

    expect(output.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api", "ui"])
    );
    expect(output.changedFiles.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(["src/app/api/users/route.ts", "src/app/dashboard/page.tsx"])
    );
    expect(output.impactedRoutes).toEqual(
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
  });

  it("returns route impact evidence through MCP redteam and agent tools", () => {
    const repo = createRouteImpactRepo();

    const redteam = JSON.parse(runRedteamReportTool({ cwd: repo }, { format: "json" }));
    const agent = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json", profile: "codex" }));

    expect(redteam.summary.impactedRoutes).toBe(2);
    expect(redteam.analysis.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users"
        })
      ])
    );
    expect(agent.summary.impactedRoutes).toBe(2);
    expect(agent.evidence.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users"
        })
      ])
    );
    expect(agent.prompt).toContain("2 route/API impacts");
  });

  it("returns weak-test audit findings", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runAuditTestsTool({ cwd: repo }, {}));

    expect(output.status).toBe("weak");
    expect(output.missingTestFindings).toEqual([]);
    expect(output.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain("test-without-assertions");
    expect(output.recommendedChecks).toContain("Add meaningful assertions to src/auth/session.test.ts.");
  });

  it("returns missing-test audit findings", () => {
    const repo = createMissingTestRepo();

    const output = JSON.parse(runAuditTestsTool({ cwd: repo }, {}));

    expect(output.status).toBe("missing");
    expect(output.missingTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "missing-nearby-tests"
    );
    expect(output.weakTestFindings).toEqual([]);
    expect(output.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain("missing-nearby-tests");
    expect(output.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add or run tests that exercise src/api/users.ts through its public behavior path.",
        "Add or run tests covering src/api/users.ts"
      ])
    );
  });

  it("returns deterministic edge-case suggestions", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runSuggestEdgeCasesTool({ cwd: repo }, {}));

    expect(output.edgeCases).toContain("Check missing, expired, malformed, and privilege-escalation credentials.");
    expect(output.recommendedChecks).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("includes route/API proof recommendations in MCP edge-case suggestions", () => {
    const repo = createRouteImpactRepo();

    const output = JSON.parse(runSuggestEdgeCasesTool({ cwd: repo }, {}));

    expect(output.edgeCases).toEqual(
      expect.arrayContaining([
        "Add or run tests covering src/app/api/users/route.ts",
        "Add or run tests covering src/app/dashboard/page.tsx",
        "Exercise the real API route with malformed, missing, and boundary-value payloads."
      ])
    );
    expect(output.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add or run tests covering src/app/api/users/route.ts",
        "Add or run tests covering src/app/dashboard/page.tsx"
      ])
    );
  });

  it("returns a markdown redteam report for MCP agents", () => {
    const repo = createWeakTestRepo();

    const output = runRedteamReportTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Redteam Report");
    expect(output).toContain("### Test Evidence Audit");
    expect(output).toContain("Changed test has no assertions");
    expect(output).toContain("LLM/model called: no");
  });

  it("returns a JSON redteam report for MCP agents", () => {
    const repo = createWeakTestRepo();
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const output = JSON.parse(runRedteamReportTool({ cwd: repo }, { format: "json" }));

    expect(output).toMatchObject({
      tool: "CodeDecay",
      mode: "deterministic",
      safety: {
        commandsExecuted: false,
        llmCalled: false
      }
    });
    expect(output.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.testAudit.status).toBe("weak");
    expect(output.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill"
      })
    ]);
  });

  it("returns a markdown agent task bundle for MCP agents", () => {
    const repo = createWeakTestRepo();

    const output = runAgentTaskBundleTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Agent Task Bundle");
    expect(output).toContain("### Instructions For The Agent");
    expect(output).toContain("### Copy-Paste Prompt");
    expect(output).toContain("You are helping fix a pull request using a CodeDecay agent task bundle.");
    expect(output).toContain("### Tool Evidence");
    expect(output).toContain("Changed test has no assertions");
    expect(output).toContain("LLM/model called by CodeDecay: no");
  });

  it("returns JSON agent task bundles for MCP agent profiles", () => {
    const repo = createWeakTestRepo();
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const output = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json", profile: "opencode" }));
    const piOutput = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json", profile: "pi" }));

    expect(output).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      safety: {
        commandsExecuted: false,
        llmCalled: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(output.prompt).toContain("CodeDecay agent task bundle");
    expect(output.agentProfile).toMatchObject({
      id: "opencode",
      name: "OpenCode"
    });
    expect(output.prompt).toContain("Target agent profile: OpenCode");
    expect(piOutput.agentProfile).toMatchObject({
      id: "pi",
      name: "Pi"
    });
    expect(piOutput.prompt).toContain("Target agent profile: Pi");
    expect(output.prompt).toContain("did not call an LLM");
    expect(output.evidence.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill"
      })
    ]);
  });

  it("does not execute configured checks without explicit confirmation", async () => {
    const repo = createExecutionRepo({ allowCommands: true });

    const output = JSON.parse(await runExecuteConfiguredChecksTool({ cwd: repo }, { format: "json" }));

    expect(output.executed).toBe(false);
    expect(output.summary.status).toBe("not_confirmed");
    expect(output.summary.total).toBe(0);
    expect(output.safety.confirmExecutionRequired).toBe(true);
    expect(output.safety.confirmExecution).toBe(false);
    expect(output.safety.allowCommands).toBe(true);
    expect(marker(repo)).not.toContain("command");
  });

  it("plans product verification targets without executing commands", () => {
    const repo = createProductRepo();

    const output = JSON.parse(runProductPlanTool({ cwd: repo }, { format: "json" }));

    expect(output.mode).toBe("mcp-product-plan");
    expect(output.latestReportPath).toBe(".codedecay/local/product-runs/latest.json");
    expect(output.targets[0]).toMatchObject({
      id: "api",
      apiEndpoints: 1
    });
    expect(output.safety.confirmExecution).toBe(false);
    expect(productMarker(repo)).toBe("");
  });

  it("runs product verification through a fixed local CLI and returns failures", () => {
    const repo = createProductRepo();
    const cliPath = writeFakeProductCli(repo);

    const output = JSON.parse(
      runProductRunTool(
        { cwd: repo, cliPath },
        {
          target: "api",
          generateApiTests: true,
          runGeneratedApiTests: true,
          confirmExecution: true,
          format: "json"
        }
      )
    );
    const failures = JSON.parse(runProductFailuresTool({ cwd: repo }, { format: "json" }));

    expect(output.executed).toBe(true);
    expect(output.exitCode).toBe(1);
    expect(output.command).toEqual(
      expect.arrayContaining(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests"])
    );
    expect(output.failures[0]).toMatchObject({
      checkId: "api-get-users",
      checkKind: "api",
      rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
    });
    expect(failures.failures).toHaveLength(1);
    expect(productMarker(repo)).toContain("--generate-api-tests");
  });

  it("reruns the first latest product failure by generated test id", () => {
    const repo = createProductRepo();
    const cliPath = writeFakeProductCli(repo);
    runProductRunTool({ cwd: repo, cliPath }, { target: "api", runGeneratedApiTests: true, confirmExecution: true, format: "json" });

    const output = JSON.parse(runProductRerunTool({ cwd: repo, cliPath }, { confirmExecution: true, format: "json" }));

    expect(output.executed).toBe(true);
    expect(output.command).toEqual(
      expect.arrayContaining(["--target", "api", "--run-generated-api-tests", "--test-id", "api-get-users"])
    );
    expect(productMarker(repo)).toContain("--test-id api-get-users");
  });

  it("uses existing skip behavior when command execution is disabled", async () => {
    const repo = createExecutionRepo({ allowCommands: false });

    const output = JSON.parse(
      await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "json" })
    );

    expect(output.executed).toBe(true);
    expect(output.summary).toMatchObject({
      status: "skipped",
      total: 3,
      skipped: 3
    });
    expect(output.safety.allowCommands).toBe(false);
    expect(output.results[0]).toMatchObject({
      kind: "test",
      command: "node scripts/command-check.mjs",
      status: "skipped"
    });
    expect(output.toolAdapters.map((adapter: { kind: string; status: string }) => [adapter.kind, adapter.status])).toEqual([
      ["playwright", "skipped"],
      ["pact", "skipped"]
    ]);
    expect(marker(repo)).not.toContain("command");
  });

  it("runs configured commands and tool adapters when confirmed", async () => {
    const repo = createExecutionRepo({ allowCommands: true });

    const output = JSON.parse(
      await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "json" })
    );

    expect(output.executed).toBe(true);
    expect(output.summary).toMatchObject({
      status: "passed",
      total: 3,
      passed: 3
    });
    expect(output.results[0]).toMatchObject({
      kind: "test",
      command: "node scripts/command-check.mjs",
      status: "passed"
    });
    expect(output.toolAdapters.map((adapter: { kind: string; status: string }) => [adapter.kind, adapter.status])).toEqual([
      ["playwright", "passed"],
      ["pact", "passed"]
    ]);
    expect(marker(repo)).toContain("command");
    expect(marker(repo)).toContain("playwright");
    expect(marker(repo)).toContain("pact");
  });

  it("reports configured tool adapter failures", async () => {
    const repo = createExecutionRepo({ allowCommands: true, failPact: true });

    const output = JSON.parse(
      await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "json" })
    );

    expect(output.summary.status).toBe("failed");
    expect(output.summary.failed).toBe(1);
    expect(output.toolAdapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pact",
          status: "failed",
          failure: expect.objectContaining({
            mode: "nonzero-exit"
          })
        })
      ])
    );
  });

  it("returns a markdown configured checks execution report", async () => {
    const repo = createExecutionRepo({ allowCommands: true });

    const output = await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "markdown" });

    expect(output).toContain("## CodeDecay MCP Execution Report");
    expect(output).toContain("### Configured Command Results");
    expect(output).toContain("### Tool Adapter Results");
    expect(output).toContain("This MCP tool never runs arbitrary commands from MCP input.");
  });
});

function createWeakTestRepo(): string {
  const repo = createRepo({
    "src/auth/session.ts": "export function validateSession(token?: string) { return Boolean(token); }\n",
    "src/auth/session.test.ts": [
      "import { validateSession } from './session';",
      "test('validates session', () => {",
      "  expect(validateSession('token')).toBe(true);",
      "});",
      ""
    ].join("\n")
  });

  writeFile(
    repo,
    "src/auth/session.ts",
    "export function validateSession(token?: string) { return { id: token || 'anonymous', role: 'admin' }; }\n"
  );
  writeFile(
    repo,
    "src/auth/session.test.ts",
    ["import { validateSession } from './session';", "test('validates session', () => {", "  validateSession('token');", "});", ""].join("\n")
  );

  return repo;
}

function createMissingTestRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function listUsers() { return []; }\n"
  });

  writeFile(repo, "src/api/users.ts", "export function listUsers() { return [{ id: 'admin', role: 'admin' }]; }\n");

  return repo;
}

function createRouteImpactRepo(): string {
  const repo = createRepo({
    "src/app/api/users/route.ts": "export async function GET() { return Response.json([]); }\n",
    "src/app/dashboard/page.tsx": "export default function Page() { return <main />; }\n"
  });

  writeFile(
    repo,
    "src/app/api/users/route.ts",
    [
      "export async function GET() {",
      "  return Response.json([]);",
      "}",
      "export async function POST() {",
      "  return Response.json({ ok: true });",
      "}",
      ""
    ].join("\n")
  );
  writeFile(repo, "src/app/dashboard/page.tsx", "export default function Page() { return <main>Changed</main>; }\n");

  return repo;
}

function createExecutionRepo(options: { allowCommands: boolean; failPact?: boolean | undefined }): string {
  const repo = createRepo({
    "src/index.ts": "export const ok = true;\n"
  });

  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "commands:",
      "  test:",
      "    - node scripts/command-check.mjs",
      "toolAdapters:",
      "  playwright:",
      "    enabled: true",
      "    command: node scripts/playwright-check.mjs",
      "  pact:",
      "    enabled: true",
      "    command: node scripts/pact-check.mjs",
      "safety:",
      `  allowCommands: ${options.allowCommands ? "true" : "false"}`,
      "  commandTimeoutMs: 5000",
      ""
    ].join("\n")
  );
  writeFile(repo, "scripts/command-check.mjs", "import { appendFileSync } from 'node:fs';\nappendFileSync('marker.txt', 'command\\n');\n");
  writeFile(
    repo,
    "scripts/playwright-check.mjs",
    "import { appendFileSync } from 'node:fs';\nappendFileSync('marker.txt', 'playwright\\n');\n"
  );
  writeFile(
    repo,
    "scripts/pact-check.mjs",
    [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync('marker.txt', 'pact\\n');",
      options.failPact ? "process.exit(13);" : ""
    ].join("\n")
  );

  return repo;
}

function createProductRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function listUsers() { return []; }\n"
  });

  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "productTesting:",
      "  targets:",
      "    api:",
      "      baseUrl: http://127.0.0.1:3000",
      "      healthCheck: http://127.0.0.1:3000/health",
      "      apiEndpoints:",
      "        - id: api-get-users",
      "          method: GET",
      "          path: /api/users",
      "          expectedStatuses: [200]",
      "safety:",
      "  allowCommands: true",
      ""
    ].join("\n")
  );

  return repo;
}

function writeFakeProductCli(repo: string): string {
  const cliPath = join(repo, "fake-codedecay-cli.mjs");
  writeFile(
    repo,
    "fake-codedecay-cli.mjs",
    [
      "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "const args = process.argv.slice(2);",
      "appendFileSync('product-marker.txt', `${args.join(' ')}\\n`);",
      "const outputIndex = args.indexOf('--output');",
      "const outputPath = outputIndex === -1 ? '.codedecay/local/product-runs/latest.json' : args[outputIndex + 1];",
      "const report = {",
      "  tool: 'CodeDecay',",
      "  version: '0.3.0',",
      "  summary: { status: 'failed' },",
      "  targets: [{",
      "    id: 'api',",
      "    status: 'failed',",
      "    baseUrl: 'http://127.0.0.1:3000',",
      "    generatedApiTestRun: {",
      "      status: 'failed',",
      "      failures: [{",
      "        testId: 'api-get-users',",
      "        title: 'GET /api/users returns a documented status',",
      "        failingStep: 'Run generated test.',",
      "        error: 'Expected documented status 200 but got 500.',",
      "        request: { method: 'GET', url: 'http://127.0.0.1:3000/api/users' },",
      "        expected: 'GET /api/users should return one of the documented statuses 200.',",
      "        actual: 'Expected documented status 200 but got 500.',",
      "        impactedFiles: ['src/api/users.ts'],",
      "        testSourcePath: '.codedecay/local/generated-api-tests/api/api.generated.spec.ts',",
      "        rerunCommand: 'npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown'",
      "      }]",
      "    }",
      "  }]",
      "};",
      "const absoluteOutputPath = join(process.cwd(), outputPath);",
      "mkdirSync(dirname(absoluteOutputPath), { recursive: true });",
      "writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\\n`);",
      "process.exit(1);",
      ""
    ].join("\n")
  );
  return cliPath;
}

function marker(repo: string): string {
  const path = join(repo, "marker.txt");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function productMarker(repo: string): string {
  const path = join(repo, "product-marker.txt");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function createRepo(files: Record<string, string>): string {
  const repo = createTempDir();
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Test"]);

  for (const [path, contents] of Object.entries(files)) {
    writeFile(repo, path, contents);
  }

  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function createTempDir(): string {
  const root = execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-mcp-XXXXXX")], {
    encoding: "utf8"
  }).trim();
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}
