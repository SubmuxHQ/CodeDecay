import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileChange } from "@submuxhq/codedecay-core";
import { runGit } from "./command";
import { parseAddedLines, parseNameStatus, parseNumStat } from "./parsers";
import { getRepoRoot } from "./repository";
import type { GitDiffOptions } from "./types";
import { getUntrackedFiles } from "./untracked";

export function getGitChangedFiles(options: GitDiffOptions): FileChange[] {
  if (!options.base && !options.head && !hasHeadCommit(options.cwd)) {
    return getNoCommitChanges(options.cwd);
  }

  const rangeArgs = getDiffRangeArgs(options);
  const nameStatusOutput = runGit(options.cwd, [
    "diff",
    "--find-renames",
    "--name-status",
    ...rangeArgs
  ]);

  const numStatOutput = runGit(options.cwd, ["diff", "--find-renames", "--numstat", ...rangeArgs]);
  const unifiedDiffOutput = runGit(options.cwd, ["diff", "--find-renames", "--unified=0", ...rangeArgs]);

  const statsByPath = parseNumStat(numStatOutput);
  const addedLinesByPath = parseAddedLines(unifiedDiffOutput);

  const trackedChanges = nameStatusOutput.trim()
    ? parseNameStatus(nameStatusOutput).map((entry) => {
        const stats = statsByPath.get(entry.path) ?? { additions: 0, deletions: 0 };
        const change: FileChange = {
          path: entry.path,
          status: entry.status,
          additions: stats.additions,
          deletions: stats.deletions,
          addedLines: addedLinesByPath.get(entry.path) ?? []
        };

        if (entry.oldPath) {
          change.oldPath = entry.oldPath;
        }

        return change;
      })
    : [];

  if (options.base || options.head) {
    return trackedChanges;
  }

  const trackedPaths = new Set(trackedChanges.map((change) => change.path));
  return [
    ...trackedChanges,
    ...getUntrackedFiles(options.cwd).filter((change) => !trackedPaths.has(change.path))
  ];
}

function getDiffRangeArgs(options: GitDiffOptions): string[] {
  if (options.base && options.head) {
    return [`${options.base}...${options.head}`];
  }

  if (options.base) {
    return [`${options.base}...HEAD`];
  }

  if (options.head) {
    return [`HEAD...${options.head}`];
  }

  return ["HEAD"];
}

function hasHeadCommit(cwd: string): boolean {
  try {
    runGit(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function getNoCommitChanges(cwd: string): FileChange[] {
  const output = runGit(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "--full-name"]);
  if (!output.trim()) {
    return [];
  }

  const repoRoot = getRepoRoot(cwd);
  const seen = new Set<string>();
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((path) => {
      if (seen.has(path)) {
        return false;
      }
      seen.add(path);
      return true;
    })
    .map((path) => createAddedChange(repoRoot, path));
}

function createAddedChange(repoRoot: string, path: string): FileChange {
  const lines = readTextFile(join(repoRoot, path))
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, content: line }))
    .filter((line) => line.content.length > 0);

  return {
    path,
    status: "added",
    additions: lines.length,
    deletions: 0,
    addedLines: lines
  };
}

function readTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
