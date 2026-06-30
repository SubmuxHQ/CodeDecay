import type { FileChange } from "@submuxhq/codedecay-core";

export function createChangedFilesFingerprint(changedFiles: FileChange[]): string {
  return changedFiles
    .map((change) => [
      change.path,
      change.oldPath ?? "",
      change.status,
      change.additions,
      change.deletions,
      change.addedLines.map((line) => `${line.line}:${line.content}`).join("\u0000")
    ].join("\u0001"))
    .sort((left, right) => left.localeCompare(right))
    .join("\u0002");
}

export function changedFilePaths(changedFiles: FileChange[]): string[] {
  return [...new Set(changedFiles.map((change) => change.path))].sort((left, right) => left.localeCompare(right));
}
