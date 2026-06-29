import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "./command";
import { getRepoRoot } from "./repository";
import type { GitWorktree, GitWorktreeOptions } from "./types";

export function createGitWorktree(options: GitWorktreeOptions): GitWorktree {
  const repoRoot = getRepoRoot(options.cwd);
  const prefix = options.prefix ?? "worktree";
  const path = mkdtempSync(join(tmpdir(), `codedecay-${prefix}-`));
  rmSync(path, { recursive: true, force: true });

  try {
    runGit(repoRoot, ["worktree", "add", "--detach", path, options.ref]);
    return {
      path,
      ref: options.ref
    };
  } catch (error: unknown) {
    rmSync(path, { recursive: true, force: true });
    throw error;
  }
}

export function removeGitWorktree(options: { cwd: string; path: string }): void {
  try {
    runGit(options.cwd, ["worktree", "remove", "--force", options.path]);
  } catch {
    rmSync(options.path, { recursive: true, force: true });
  }
}
