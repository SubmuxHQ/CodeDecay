import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const cliPath = join(repoRoot, "packages/cli/dist/index.js");
const tempRoots: string[] = [];

beforeAll(() => {
  execFileSync("pnpm", ["--filter", "@submux/codedecay", "build"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("built codedecay CLI", () => {
  it("returns correct fail-on exit codes for low, medium, and high risk repos", () => {
    const lowRepo = createLowRiskRepo();
    expect(runBuilt(["analyze", "--cwd", lowRepo, "--fail-on", "high"]).status).toBe(0);
    expect(runBuilt(["analyze", "--cwd", lowRepo, "--fail-on", "medium"]).status).toBe(0);
    expect(runBuilt(["analyze", "--cwd", lowRepo, "--fail-on", "low"]).status).toBe(1);

    const mediumRepo = createMediumRiskRepo();
    expect(runBuilt(["analyze", "--cwd", mediumRepo, "--fail-on", "high"]).status).toBe(0);
    expect(runBuilt(["analyze", "--cwd", mediumRepo, "--fail-on", "medium"]).status).toBe(1);
    expect(runBuilt(["analyze", "--cwd", mediumRepo, "--fail-on", "low"]).status).toBe(1);

    const highRepo = createHighRiskRepo();
    expect(runBuilt(["analyze", "--cwd", highRepo, "--fail-on", "high"]).status).toBe(1);
    expect(runBuilt(["analyze", "--cwd", highRepo, "--fail-on", "medium"]).status).toBe(1);
    expect(runBuilt(["analyze", "--cwd", highRepo, "--fail-on", "low"]).status).toBe(1);
  });

  it("honors cwd and writes relative output inside the analyzed repo", () => {
    const repo = createLowRiskRepo();
    const result = runBuilt([
      "analyze",
      "--cwd",
      repo,
      "--format",
      "sarif",
      "--output",
      "codedecay.sarif"
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(join(repo, "codedecay.sarif"))).toBe(true);
  });

  it("prints user-friendly git errors from the built CLI", () => {
    const nonGitDir = createTempDir();
    const nonGit = runBuilt(["analyze", "--cwd", nonGitDir, "--format", "json"]);

    expect(nonGit.status).toBe(2);
    expect(nonGit.stdout).toBe("");
    expect(nonGit.stderr).toBe(
      `CodeDecay failed: ${nonGitDir} is not a git repository. Run from a git repo or pass --cwd <repo>.\n`
    );

    const repo = createLowRiskRepo();
    const invalidRef = runBuilt([
      "analyze",
      "--cwd",
      repo,
      "--base",
      "definitely-missing-ref",
      "--head",
      "HEAD",
      "--format",
      "json"
    ]);

    expect(invalidRef.status).toBe(2);
    expect(invalidRef.stdout).toBe("");
    expect(invalidRef.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
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

  it("supports agent handoff profiles from the built CLI", () => {
    const repo = createMediumRiskRepo();

    const result = runBuilt(["agent", "--cwd", repo, "--profile", "desktop", "--format", "json"]);
    const bundle = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(bundle.agentProfile).toMatchObject({
      id: "desktop",
      name: "Desktop/local agent"
    });
    expect(bundle.prompt).toContain("Target agent profile: Desktop/local agent");
  });

  it("prints loaded config from the built CLI", () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      ["version: 1", "commands:", "  test: pnpm test", "safety:", "  commandTimeoutMs: 15000", ""].join("\n")
    );

    const result = runBuilt(["config", "--cwd", repo, "--format", "json"]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      config: {
        commands: {
          test: ["pnpm test"]
        },
        safety: {
          commandTimeoutMs: 15000
        }
      }
    });
  });

  it("executes configured commands from the built CLI", () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"console.log('built execute ok')\"",
        "probes: []",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = runBuilt(["execute", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.summary.status).toBe("passed");
    expect(report.results[0]).toMatchObject({
      kind: "test",
      status: "passed",
      stdout: "built execute ok\n"
    });
  });

  it("executes configured tool adapters from the built CLI", () => {
    const repo = createLowRiskRepo();
    writeFile(repo, "playwright-pass.js", "console.log('built browser flow ok');\n");
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands: {}",
        "probes: []",
        "toolAdapters:",
        "  playwright:",
        "    command: node playwright-pass.js",
        "safety:",
        "  allowCommands: true",
        "  commandTimeoutMs: 1000",
        ""
      ].join("\n")
    );

    const result = runBuilt(["execute", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 1,
      passed: 1
    });
    expect(report.results).toEqual([]);
    expect(report.toolAdapters[0]).toMatchObject({
      kind: "playwright",
      command: "node playwright-pass.js",
      status: "passed"
    });
    expect(report.toolAdapters[0].evidence[0]).toMatchObject({
      kind: "browser-flow",
      metadata: {
        stdout: "built browser flow ok"
      }
    });
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

  it("keeps source-checkout examples independent of unpublished npm versions", () => {
    const examplePackagePaths = [
      "examples/nextjs-risk-demo/package.json",
      "examples/node-api-risk-demo/scenarios/baseline/package_DOT_json.fixture",
      "examples/node-api-risk-demo/scenarios/risky/package_DOT_json.fixture"
    ];

    for (const packagePath of examplePackagePaths) {
      const packageJson = JSON.parse(readFileSync(join(repoRoot, packagePath), "utf8"));

      expect(packageJson.devDependencies?.["@submux/codedecay"]).toBeUndefined();
      expect(JSON.stringify(packageJson.scripts)).toContain("node ../../packages/cli/dist/index.js");
    }
  });

  it("compares configured probes from the built CLI", () => {
    const repo = createRepo({
      "probe.js": [
        "const { readFileSync } = require('node:fs');",
        "const value = readFileSync('value.txt', 'utf8').trim();",
        "console.log(JSON.stringify({ value }));",
        ""
      ].join("\n"),
      "value.txt": "base\n",
      ".codedecay/config.yml": [
        "version: 1",
        "commands: {}",
        "probes:",
        "  - name: value probe",
        "    command: node probe.js",
        "    timeoutMs: 1000",
        "safety:",
        "  commandTimeoutMs: 1000",
        "  allowCommands: true",
        ""
      ].join("\n")
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(repo, "value.txt", "head\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "update value"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const result = runBuilt(["differential", "--cwd", repo, "--base", base, "--head", head, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(report.summary.status).toBe("changed");
    expect(report.results[0].differences).toContain("structured stdout changed");
  });

  it("runs when dist CLI is invoked through a symlinked path", () => {
    const repo = createLowRiskRepo();
    const symlinkRoot = createTempDir();
    const linkedRoot = join(symlinkRoot, "codedecay-link");
    symlinkSync(repoRoot, linkedRoot, "dir");

    const result = runBuilt(["analyze", "--cwd", repo, "--format", "json"], join(linkedRoot, "packages/cli/dist/index.js"));

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "low"
      }
    });
  });
});

function runBuilt(args: string[], path = cliPath): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [path, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function createLowRiskRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });
  writeFile(repo, "README.md", "# Project\nDocs change.\n");
  return repo;
}

function createMediumRiskRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
  });
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
  return repo;
}

function createHighRiskRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function handler() { return true; }\n",
    "src/auth/session.ts": "export function session() { return true; }\n",
    "src/db/schema.prisma": "model User { id String @id }\n"
  });
  writeFile(repo, "src/api/users.ts", "export function handler() { return false; }\n");
  writeFile(repo, "src/auth/session.ts", "export function session(token?: string) { if (!token) return null; return true; }\n");
  writeFile(repo, "src/db/schema.prisma", "model User { id String @id email String }\n");
  return repo;
}

function createNodeApiExampleRepo(): string {
  const root = createTempDir();
  const repo = join(root, "node-api-risk-demo");
  cpSync(join(repoRoot, "examples/node-api-risk-demo"), repo, { recursive: true });

  execFileSync("node", ["scripts/materialize.mjs", "baseline"], {
    cwd: repo,
    stdio: "ignore"
  });
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Example"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "baseline Node API example"]);

  execFileSync("node", ["scripts/materialize.mjs", "risky"], {
    cwd: repo,
    stdio: "ignore"
  });

  return repo;
}

function createNextjsExampleRepo(): string {
  const root = createTempDir();
  const repo = join(root, "nextjs-risk-demo");
  cpSync(join(repoRoot, "examples/nextjs-risk-demo"), repo, { recursive: true });

  execFileSync("node", ["scripts/materialize.mjs", "baseline"], {
    cwd: repo,
    stdio: "ignore"
  });
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Example"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "baseline Next.js example"]);

  execFileSync("node", ["scripts/materialize.mjs", "risky"], {
    cwd: repo,
    stdio: "ignore"
  });

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
  const root = mkdtempSync(join(tmpdir(), "codedecay-built-"));
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

function gitOutput(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}
