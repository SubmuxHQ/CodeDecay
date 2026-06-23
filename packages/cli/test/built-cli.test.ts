import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
