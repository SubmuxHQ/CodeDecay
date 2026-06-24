import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("codedecay analyze CLI contract", () => {
  it("renders JSON and markdown to stdout", async () => {
    const repo = createLowRiskRepo();

    const json = await run(["analyze", "--format", "json"], repo);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "low"
      }
    });

    const markdown = await run(["analyze", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Report");
    expect(markdown.stdout).toContain("Merge risk");
  });

  it("writes SARIF with --output and resolves relative output from --cwd", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(
      ["analyze", "--cwd", repo, "--format", "sarif", "--output", "codedecay.sarif"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay.sarif");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      version: "2.1.0"
    });
  });

  it("keeps absolute --output paths absolute", async () => {
    const repo = createLowRiskRepo();
    const outputPath = join(createTempDir(), "absolute-output.json");

    const result = await run(["analyze", "--format", "json", "--output", outputPath], repo);

    expect(result.exitCode).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8")).tool).toBe("CodeDecay");
  });

  it("uses --cwd as the repository being analyzed", async () => {
    const repo = createMediumRiskRepo();
    const outsideCwd = createTempDir();

    const result = await run(["analyze", "--cwd", repo, "--format", "json"], outsideCwd);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.changedFiles.map((file: { path: string }) => file.path)).toContain("src/api/users.ts");
    expect(report.summary.riskLevel).toBe("medium");
  });

  it("returns correct exit codes for --fail-on thresholds", async () => {
    const lowRepo = createLowRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], lowRepo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], lowRepo, 0);
    await expectExit(["analyze", "--fail-on", "low"], lowRepo, 1);

    const mediumRepo = createMediumRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], mediumRepo, 0);
    await expectExit(["analyze", "--fail-on", "medium"], mediumRepo, 1);
    await expectExit(["analyze", "--fail-on", "low"], mediumRepo, 1);

    const highRepo = createHighRiskRepo();
    await expectExit(["analyze", "--fail-on", "high"], highRepo, 1);
    await expectExit(["analyze", "--fail-on", "medium"], highRepo, 1);
    await expectExit(["analyze", "--fail-on", "low"], highRepo, 1);
  });

  it("fails clearly for invalid base/head refs", async () => {
    const repo = createLowRiskRepo();

    const result = await run(
      ["analyze", "--base", "definitely-missing-ref", "--head", "HEAD", "--format", "json"],
      repo
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
    expect(result.stderr).toContain("Check --base/--head and fetch the ref before running CodeDecay.");
  });

  it("fails clearly for invalid head refs", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["analyze", "--head", "definitely-missing-head", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-head".');
    expect(result.stderr).toContain("Check --base/--head and fetch the ref before running CodeDecay.");
  });

  it("fails clearly outside a git repository", async () => {
    const nonGitDir = createTempDir();

    const result = await run(["analyze", "--format", "json"], nonGitDir);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `CodeDecay failed: ${nonGitDir} is not a git repository. Run from a git repo or pass --cwd <repo>.\n`
    );
  });

  it("has deterministic report content after ignoring generatedAt", async () => {
    const repo = createMediumRiskRepo();

    const first = stableReport((await run(["analyze", "--format", "json"], repo)).stdout);
    const second = stableReport((await run(["analyze", "--format", "json"], repo)).stdout);

    expect(second).toEqual(first);
  });
});

describe("codedecay config CLI contract", () => {
  it("prints safe defaults when config is missing", async () => {
    const cwd = createTempDir();
    const result = await run(["config"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      config: {
        version: 1,
        commands: {
          test: [],
          build: [],
          start: []
        },
        probes: [],
        safety: {
          commandTimeoutMs: 120000,
          allowCommands: false
        },
        llm: {
          provider: "disabled",
          timeoutMs: 30000
        }
      }
    });
  });

  it("loads config from --cwd and renders markdown", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test: pnpm test",
        "  build: pnpm build",
        "safety:",
        "  commandTimeoutMs: 45000",
        ""
      ].join("\n")
    );

    const result = await run(["config", "--cwd", repo, "--format", "markdown"], outsideCwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Config");
    expect(result.stdout).toContain(".codedecay/config.yml");
    expect(result.stdout).toContain("`pnpm test`");
    expect(result.stdout).toContain("45000ms");
    expect(result.stdout).toContain("### LLM");
    expect(result.stdout).toContain("| Provider | disabled |");
  });

  it("fails clearly for invalid config files", async () => {
    const cwd = createTempDir();
    writeFile(cwd, ".codedecay/config.yml", "version: 2\n");

    const result = await run(["config"], cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CodeDecay failed: Invalid CodeDecay config");
    expect(result.stderr).toContain("version must be 1");
  });
});

describe("codedecay memory CLI contract", () => {
  it("prints memory defaults", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["memory", "--format", "json"], repo);
    const parsed = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(parsed.memory.version).toBe(1);
    for (const section of ["flows", "commands", "invariants", "architecture", "regressions"]) {
      expect(parsed.memory[section]).toEqual([]);
    }
  });

  it("loads memory from --cwd and renders markdown", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeFile(
      repo,
      ".codedecay/memory.json",
      JSON.stringify(
        {
          version: 1,
          flows: [{ name: "Checkout", areas: ["api"], checks: ["failed card retry"] }]
        },
        null,
        2
      )
    );

    const result = await run(["memory", "--cwd", repo, "--format", "markdown"], outsideCwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Memory");
    expect(result.stdout).toContain("| Flows | 1 |");
  });

  it("adds memory context to analyze reports", async () => {
    const repo = createRepo({
      "src/auth/session.ts": "export function session() { return true; }\n",
      ".codedecay/memory.json": JSON.stringify(
        {
          version: 1,
          flows: [{ name: "Login flow", areas: ["auth"], checks: ["missing token"] }],
          commands: [{ name: "Auth tests", command: "pnpm test auth", areas: ["auth"] }],
          invariants: [
            {
              name: "Auth fails closed",
              description: "Missing users must not become admins.",
              areas: ["auth"],
              severity: "high"
            }
          ],
          architecture: [],
          regressions: [
            {
              title: "Anonymous admin",
              description: "Fallback user became admin.",
              areas: ["auth"],
              check: "missing token request"
            }
          ]
        },
        null,
        2
      )
    });
    writeFile(repo, "src/auth/session.ts", "export function session() { return { role: 'admin' }; }\n");

    const result = await run(["analyze", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.findings.map((finding: { ruleId: string }) => finding.ruleId)).toEqual(
      expect.arrayContaining(["memory-invariant-impacted", "memory-past-regression-area"])
    );
    expect(report.recommendedTests).toEqual(
      expect.arrayContaining([
        "Verify invariant: Auth fails closed",
        "Regression check: missing token request",
        "Verify flow: Login flow",
        "Flow check (Login flow): missing token",
        "Run project command: Auth tests (pnpm test auth)"
      ])
    );
  });
});

describe("codedecay redteam CLI contract", () => {
  it("renders deterministic JSON and markdown redteam reports", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ran.txt','yes')\""
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
    expect(existsSync(join(repo, "codedecay-ran.txt"))).toBe(false);

    const markdown = await run(["redteam", "--format", "markdown"], repo);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain("## CodeDecay Redteam Report");
    expect(markdown.stdout).toContain("### What Could Break");
    expect(markdown.stdout).toContain("### Tasks For Your Coding Agent");
    expect(markdown.stdout).toContain("LLM/model called: no");
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

describe("codedecay execute CLI contract", () => {
  it("skips configured commands unless safety.allowCommands is true", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test:",
        "    - node -e \"console.log('should not run')\"",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    );

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "skipped",
      total: 1,
      skipped: 1
    });
    expect(report.results[0]).toMatchObject({
      kind: "test",
      status: "skipped",
      stdout: ""
    });
  });

  it("runs configured test, build, start, and probe commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\"",
      buildCommand: "node -e \"console.log('build ok')\"",
      startCommand: "node -e \"console.log('start ok')\"",
      probeCommand: "node -e \"console.log('probe ok')\""
    });

    const result = await run(["execute", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary).toMatchObject({
      status: "passed",
      total: 4,
      passed: 4
    });
    expect(report.results.map((item: { kind: string }) => item.kind)).toEqual(["test", "build", "start", "probe"]);
    expect(report.results.map((item: { stdout: string }) => item.stdout)).toEqual([
      "test ok\n",
      "build ok\n",
      "start ok\n",
      "probe ok\n"
    ]);
  });

  it("returns exit 1 and reports failures from configured commands", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\"",
      probeCommand: "node -e \"console.error('probe failed'); process.exit(3)\""
    });

    const result = await run(["execute", "--format", "markdown"], repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("## CodeDecay Execution Report");
    expect(result.stdout).toContain("**Overall status:** Failed");
    expect(result.stdout).toContain("Exit code: 3");
    expect(result.stdout).toContain("probe failed");
  });

  it("writes execution reports to relative --output paths from --cwd", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"console.log('test ok')\""
    });

    const result = await run(["execute", "--cwd", repo, "--format", "json", "--output", "codedecay-execute.json"], outsideCwd);
    const outputPath = join(repo, "codedecay-execute.json");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });
});

describe("codedecay differential CLI contract", () => {
  it("reports changed structured probe output between base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "changed",
      total: 1,
      changed: 1
    });
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: ["structured stdout changed"],
      base: {
        status: "passed",
        structuredOutput: { value: "base" }
      },
      head: {
        status: "passed",
        structuredOutput: { value: "head" }
      }
    });
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-base-");
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-head-");
  });

  it("passes when configured probes behave the same on base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Differential Report");
    expect(result.stdout).toContain("**Overall status:** Passed");
  });

  it("skips differential probes when command execution is disabled", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: false });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary.status).toBe("skipped");
    expect(report.results[0].status).toBe("skipped");
  });

  it("writes differential reports to relative --output paths from --cwd", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });
    const outsideCwd = createTempDir();

    const result = await run(
      ["differential", "--cwd", repo, "--base", base, "--head", head, "--format", "json", "--output", "codedecay-diff.json"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay-diff.json");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });

  it("fails clearly when differential refs are missing", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["differential", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("codedecay differential requires --base <ref> and --head <ref>.");
  });
});

async function expectExit(args: string[], cwd: string, expectedExitCode: number): Promise<void> {
  const result = await run(args, cwd);
  expect(result.exitCode).toBe(expectedExitCode);
}

async function run(args: string[], cwd: string): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });

  return { exitCode, stdout, stderr };
}

function stableReport(output: string): unknown {
  const report = JSON.parse(output);
  delete report.generatedAt;
  return report;
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

function createDifferentialRepo(input: { headValue: string; allowCommands: boolean }): {
  repo: string;
  base: string;
  head: string;
} {
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
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  if (input.headValue === "base") {
    writeFile(repo, "README.md", "# Fixture\nDocs-only head change.\n");
  } else {
    writeFile(repo, "value.txt", `${input.headValue}\n`);
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "update value"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
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
  const root = mkTempRoot();
  tempRoots.push(root);
  return root;
}

function mkTempRoot(): string {
  return execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-XXXXXX")], {
    encoding: "utf8"
  }).trim();
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function writeExecutionConfig(
  repo: string,
  input: {
    allowCommands: boolean;
    testCommand?: string | undefined;
    buildCommand?: string | undefined;
    startCommand?: string | undefined;
    probeCommand?: string | undefined;
  }
): void {
  const lines = ["version: 1"];
  const commands = [
    ["test", input.testCommand],
    ["build", input.buildCommand],
    ["start", input.startCommand]
  ] as const;

  if (commands.some(([, command]) => command)) {
    lines.push("commands:");
    for (const [name, command] of commands) {
      appendCommand(lines, name, command);
    }
  } else {
    lines.push("commands: {}");
  }

  if (input.probeCommand) {
    lines.push("probes:");
    lines.push("  - name: smoke probe", `    command: ${input.probeCommand}`, "    timeoutMs: 1000");
  } else {
    lines.push("probes: []");
  }

  lines.push("safety:", "  commandTimeoutMs: 1000", `  allowCommands: ${input.allowCommands}`, "");
  writeFile(repo, ".codedecay/config.yml", lines.join("\n"));
}

function appendCommand(lines: string[], name: "test" | "build" | "start", command: string | undefined): void {
  if (command) {
    lines.push(`  ${name}:`);
    lines.push(`    - ${command}`);
  }
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
