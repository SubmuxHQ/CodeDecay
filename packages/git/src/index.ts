import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedLine, FileChange, FileStatus } from "@submuxhq/codedecay-core";

export interface GitDiffOptions {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
}

interface ParsedNameStatus {
  path: string;
  oldPath?: string | undefined;
  status: FileStatus;
}

interface ParsedNumStat {
  additions: number;
  deletions: number;
}

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

export function getRepoRoot(cwd: string): string {
  const output = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const repoRoot = output.trim();
  if (!repoRoot) {
    throw new Error(`Not a git repository: ${cwd}`);
  }

  return repoRoot;
}

export function readFileAtRef(cwd: string, ref: string, path: string): string | undefined {
  try {
    return runGit(cwd, ["show", `${ref}:${path}`]);
  } catch {
    return undefined;
  }
}

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

function getUntrackedFiles(cwd: string): FileChange[] {
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

function runGit(cwd: string, args: string[]): string {
  try {
    const options: ExecFileSyncOptionsWithStringEncoding = {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    };

    return execFileSync("git", ["-C", cwd, ...args], {
      ...options
    });
  } catch (error: unknown) {
    const stderr = getCommandStderr(error);
    const suffix = stderr ? `\n${stderr}` : "";
    throw new Error(`Git command failed: git -C ${cwd} ${args.join(" ")}${suffix}`);
  }
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

function readTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function getCommandStderr(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === "string") {
    return stderr.trim();
  }

  if (Buffer.isBuffer(stderr)) {
    return stderr.toString("utf8").trim();
  }

  return "";
}
