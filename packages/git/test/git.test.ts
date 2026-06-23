import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGitWorktree,
  getGitChangedFiles,
  getRepoRoot,
  parseAddedLines,
  parseNameStatus,
  parseNumStat,
  removeGitWorktree
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("parseNameStatus", () => {
  it("detects changed, deleted, and renamed files", () => {
    expect(parseNameStatus("M\tsrc/app.ts\nD\tsrc/old.ts\nR100\tsrc/a.ts\tsrc/b.ts\n")).toEqual([
      {
        path: "src/app.ts",
        status: "modified"
      },
      {
        path: "src/old.ts",
        status: "deleted"
      },
      {
        path: "src/b.ts",
        oldPath: "src/a.ts",
        status: "renamed"
      }
    ]);
  });
});

describe("parseNumStat", () => {
  it("parses numeric additions and deletions", () => {
    const stats = parseNumStat("10\t2\tsrc/app.ts\n-\t-\tpublic/logo.png\n");

    expect(stats.get("src/app.ts")).toEqual({ additions: 10, deletions: 2 });
    expect(stats.get("public/logo.png")).toEqual({ additions: 0, deletions: 0 });
  });
});

describe("parseAddedLines", () => {
  it("captures added line numbers from unified diff output", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -4,0 +5,2 @@",
      "+const value = 1;",
      "+export { value };"
    ].join("\n");

    expect(parseAddedLines(diff).get("src/app.ts")).toEqual([
      { line: 5, content: "const value = 1;" },
      { line: 6, content: "export { value };" }
    ]);
  });
});

describe("live git integration", () => {
  it("detects changed, deleted, renamed, and untracked files", () => {
    const repo = createRepo({
      "src/changed.ts": "export const value = 1;\n",
      "src/deleted.ts": "export const deleted = true;\n",
      "src/old-name.ts": "export const renamed = true;\n"
    });

    writeFile(repo, "src/changed.ts", "export const value = 1;\nexport const next = 2;\n");
    rmSync(join(repo, "src/deleted.ts"));
    git(repo, ["mv", "src/old-name.ts", "src/new-name.ts"]);
    writeFile(repo, "src/untracked.ts", "export const untracked = true;\n");

    const changes = getGitChangedFiles({ cwd: repo });
    const byPath = new Map(changes.map((change) => [change.path, change]));

    expect(byPath.get("src/changed.ts")).toMatchObject({
      status: "modified",
      additions: 1,
      deletions: 0,
      addedLines: [{ line: 2, content: "export const next = 2;" }]
    });
    expect(byPath.get("src/deleted.ts")).toMatchObject({
      status: "deleted"
    });
    expect(byPath.get("src/new-name.ts")).toMatchObject({
      status: "renamed",
      oldPath: "src/old-name.ts"
    });
    expect(byPath.get("src/untracked.ts")).toMatchObject({
      status: "added",
      additions: 1,
      deletions: 0,
      addedLines: [{ line: 1, content: "export const untracked = true;" }]
    });
  });

  it("handles nested cwd with root-relative paths", () => {
    const repo = createRepo({
      "packages/app/src/file.ts": "export const value = 1;\n"
    });
    const nestedCwd = join(repo, "packages/app");

    writeFile(repo, "packages/app/src/file.ts", "export const value = 1;\nexport const next = 2;\n");
    writeFile(repo, "packages/app/src/new.ts", "export const untracked = true;\n");

    expect(getRepoRoot(nestedCwd)).toBe(realpathSync(repo));
    expect(getGitChangedFiles({ cwd: nestedCwd }).map((change) => change.path).sort()).toEqual([
      "packages/app/src/file.ts",
      "packages/app/src/new.ts"
    ]);
  });

  it("throws a clear error for invalid refs", () => {
    const repo = createRepo({
      "src/app.ts": "export const value = 1;\n"
    });

    expect(() => getGitChangedFiles({ cwd: repo, base: "does-not-exist", head: "HEAD" })).toThrow(
      /Git command failed: git -C .* diff .*does-not-exist/
    );
  });

  it("detects changes between explicit base and head refs", () => {
    const repo = createRepo({
      "src/app.ts": "export const value = 1;\n"
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    writeFile(repo, "src/app.ts", "export const value = 1;\nexport const next = 2;\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "update app"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(repo, "src/untracked.ts", "export const untracked = true;\n");

    expect(getGitChangedFiles({ cwd: repo, base, head })).toEqual([
      {
        path: "src/app.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        addedLines: [{ line: 2, content: "export const next = 2;" }]
      }
    ]);
  });

  it("throws a clear error for invalid head refs", () => {
    const repo = createRepo({
      "src/app.ts": "export const value = 1;\n"
    });

    expect(() => getGitChangedFiles({ cwd: repo, head: "does-not-exist" })).toThrow(
      /Git command failed: git -C .* diff .*does-not-exist/
    );
  });

  it("creates and removes temporary git worktrees", () => {
    const repo = createRepo({
      "src/app.ts": "export const value = 1;\n"
    });
    const ref = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const worktree = createGitWorktree({ cwd: repo, ref, prefix: "test" });
    expect(existsSync(join(worktree.path, "src/app.ts"))).toBe(true);

    removeGitWorktree({ cwd: repo, path: worktree.path });

    expect(existsSync(worktree.path)).toBe(false);
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain(worktree.path);
  });
});

function createRepo(files: Record<string, string>): string {
  const repo = mkdtempSync(join(tmpdir(), "codedecay-git-"));
  tempRoots.push(repo);

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
