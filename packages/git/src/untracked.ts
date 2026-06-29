import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileChange } from "@submuxhq/codedecay-core";
import { runGit } from "./command";
import { getRepoRoot } from "./repository";

export function getUntrackedFiles(cwd: string): FileChange[] {
  const output = runGit(cwd, ["ls-files", "--others", "--exclude-standard", "--full-name"]);
  if (!output.trim()) {
    return [];
  }

  const repoRoot = getRepoRoot(cwd);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => {
      const content = readTextFile(join(repoRoot, path));
      const lines = content.split(/\r?\n/);
      const addedLines = lines
        .map((line, index) => ({ line: index + 1, content: line }))
        .filter((line) => line.content.length > 0);

      return {
        path,
        status: "added",
        additions: addedLines.length,
        deletions: 0,
        addedLines
      };
    });
}

function readTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
