import type { ChangedLine, FileStatus } from "@submuxhq/codedecay-core";
import type { ParsedNameStatus, ParsedNumStat } from "./types";

export function parseNameStatus(output: string): ParsedNameStatus[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const code = parts[0] ?? "";

      if (code.startsWith("R")) {
        const oldPath = parts[1];
        const newPath = parts[2];
        if (!oldPath || !newPath) {
          throw new Error(`Invalid rename line in git diff: ${line}`);
        }

        return {
          path: newPath,
          oldPath,
          status: "renamed"
        };
      }

      const path = parts[1];
      if (!path) {
        throw new Error(`Invalid name-status line in git diff: ${line}`);
      }

      return {
        path,
        status: statusFromNameStatus(code)
      };
    });
}

export function parseNumStat(output: string): Map<string, ParsedNumStat> {
  const stats = new Map<string, ParsedNumStat>();

  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split("\t");
    const additions = parseStatNumber(parts[0]);
    const deletions = parseStatNumber(parts[1]);
    const path = parts.at(-1);

    if (path) {
      stats.set(path, { additions, deletions });
    }
  }

  return stats;
}

export function parseAddedLines(output: string): Map<string, ChangedLine[]> {
  const addedLinesByPath = new Map<string, ChangedLine[]>();
  let currentPath: string | undefined;
  let nextLineNumber = 0;

  for (const rawLine of output.split(/\r?\n/)) {
    if (rawLine.startsWith("+++ b/")) {
      currentPath = rawLine.slice("+++ b/".length);
      if (!addedLinesByPath.has(currentPath)) {
        addedLinesByPath.set(currentPath, []);
      }
      continue;
    }

    if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/\+(\d+)(?:,\d+)?/);
      nextLineNumber = match?.[1] ? Number(match[1]) : 0;
      continue;
    }

    if (!currentPath || nextLineNumber === 0) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      addedLinesByPath.get(currentPath)?.push({
        line: nextLineNumber,
        content: rawLine.slice(1)
      });
      nextLineNumber += 1;
      continue;
    }

    if (!rawLine.startsWith("-")) {
      nextLineNumber += 1;
    }
  }

  return addedLinesByPath;
}

function statusFromNameStatus(code: string): FileStatus {
  if (code === "A") {
    return "added";
  }

  if (code === "D") {
    return "deleted";
  }

  return "modified";
}

function parseStatNumber(value: string | undefined): number {
  if (!value || value === "-") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
