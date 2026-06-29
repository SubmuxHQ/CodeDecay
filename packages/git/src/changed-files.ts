import type { FileChange } from "@submuxhq/codedecay-core";
import { runGit } from "./command";
import { parseAddedLines, parseNameStatus, parseNumStat } from "./parsers";
import type { GitDiffOptions } from "./types";
import { getUntrackedFiles } from "./untracked";

export function getGitChangedFiles(options: GitDiffOptions): FileChange[] {
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
