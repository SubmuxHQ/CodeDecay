import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";

export const repoRoot = process.cwd();
export const cliPath = join(repoRoot, "packages/cli/dist/index.js");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

export function ensureBuiltCli(): void {
  const stateDir = join(repoRoot, ".codedecay/local/test-built-cli");
  const buildKey = currentBuildKey();
  const markerPath = join(stateDir, `built-${buildKey}.json`);
  const lockPath = join(stateDir, `build-${buildKey}.lock`);

  mkdirSync(stateDir, { recursive: true });
  if (existsSync(markerPath) && existsSync(cliPath)) {
    return;
  }

  while (true) {
    try {
      mkdirSync(lockPath);
      try {
        execFileSync("pnpm", ["--filter", "@submuxhq/codedecay", "build"], {
          cwd: repoRoot,
          stdio: "ignore"
        });
        writeFileSync(markerPath, JSON.stringify({ buildKey, builtAt: new Date().toISOString() }, null, 2), "utf8");
        return;
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      waitForBuildLock(markerPath, lockPath);
      if (existsSync(markerPath) && existsSync(cliPath)) {
        return;
      }
    }
  }
}

function waitForBuildLock(markerPath: string, lockPath: string): void {
  const startedAt = Date.now();
  while (existsSync(lockPath)) {
    if (existsSync(markerPath) && existsSync(cliPath)) {
      return;
    }
    if (Date.now() - startedAt > 120_000) {
      throw new Error(`Timed out waiting for built CLI test lock: ${lockPath}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
}

function currentBuildKey(): string {
  const inputs = [
    safeGitOutput(["rev-parse", "HEAD"]),
    safeGitOutput(["diff", "--", "packages", "package.json", "pnpm-lock.yaml", "tsconfig.base.json"]),
    safeGitOutput(["diff", "--cached", "--", "packages", "package.json", "pnpm-lock.yaml", "tsconfig.base.json"])
  ];
  return createHash("sha256").update(inputs.join("\0")).digest("hex").slice(0, 16);
}

function safeGitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export function runBuilt(args: string[], path = cliPath): { status: number | null; stdout: string; stderr: string } {
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

export function currentCliVersion(): string {
  const packageJsonPath = join(repoRoot, "packages/cli/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}

export function createLowRiskRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });
  writeFile(repo, "README.md", "# Project\nDocs change.\n");
  return repo;
}

export function createMediumRiskRepo(): string {
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

export function createHighRiskRepo(): string {
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

export function createNodeApiExampleRepo(): string {
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

export function createNextjsExampleRepo(): string {
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

export function createRepo(files: Record<string, string>): string {
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

export function createTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-built-"));
  tempRoots.push(root);
  return root;
}

export function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

export function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}

export function gitOutput(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}
