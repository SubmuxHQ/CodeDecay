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
    const repo = createWeakTestRepo();

    const output = JSON.parse(runImpactMapTool({ cwd: repo }, {}));

    expect(output.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["auth", "test"])
    );
    expect(output.changedFiles.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(["src/auth/session.ts", "src/auth/session.test.ts"])
    );
  });

  it("returns weak-test audit findings", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runAuditTestsTool({ cwd: repo }, {}));

    expect(output.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain("test-without-assertions");
    expect(output.recommendedChecks).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("returns deterministic edge-case suggestions", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runSuggestEdgeCasesTool({ cwd: repo }, {}));

    expect(output.edgeCases).toContain("Check missing, expired, malformed, and privilege-escalation credentials.");
    expect(output.recommendedChecks).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("returns a markdown redteam report for MCP agents", () => {
    const repo = createWeakTestRepo();

    const output = runRedteamReportTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Redteam Report");
    expect(output).toContain("### Test Proof Audit");
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
    expect(output).toContain("### Tool Evidence");
    expect(output).toContain("Changed test has no assertions");
    expect(output).toContain("LLM/model called by CodeDecay: no");
  });

  it("returns a JSON agent task bundle for MCP agents", () => {
    const repo = createWeakTestRepo();
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const output = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json" }));

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

function marker(repo: string): string {
  const path = join(repo, "marker.txt");
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
