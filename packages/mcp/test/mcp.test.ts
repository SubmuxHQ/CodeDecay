import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createCodeDecayMcpServer,
  runAnalyzePrTool,
  runAuditTestsTool,
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
