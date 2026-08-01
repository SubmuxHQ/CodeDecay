import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { AgentSessionGitSnapshot } from "./types";

export function createAgentSessionGitSnapshot(rootDir: string): AgentSessionGitSnapshot {
  const headRevision = gitOutput(rootDir, ["rev-parse", "HEAD"])?.trim() ?? "unknown";
  const statusOutput = gitOutput(rootDir, ["status", "--porcelain=v1", "--untracked-files=all"]) ?? "";
  const statusEntries = statusOutput
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !statusLineOnlyTouchesLocalState(line));
  const dirtyFiles = [...new Set(statusEntries.flatMap((line) => statusLinePaths(line)).filter(Boolean))].sort();
  const workingTreeFingerprint = createHash("sha256")
    .update(JSON.stringify({ headRevision, statusEntries }))
    .digest("hex");

  return {
    headRevision,
    workingTreeFingerprint,
    dirtyFiles
  };
}

function gitOutput(rootDir: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", rootDir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return undefined;
  }
}

function statusLineOnlyTouchesLocalState(line: string): boolean {
  const paths = statusLinePaths(line);
  return paths.length > 0 && paths.every((path) => path === ".codedecay/local" || path.startsWith(".codedecay/local/"));
}

function statusLinePaths(line: string): string[] {
  const pathPart = line.slice(3).trim();
  if (!pathPart) {
    return [];
  }

  if (pathPart.includes(" -> ")) {
    return pathPart.split(" -> ").map((path) => unquotePath(path.trim()));
  }

  return [unquotePath(pathPart)];
}

function unquotePath(path: string): string {
  if (path.startsWith("\"") && path.endsWith("\"")) {
    return path.slice(1, -1);
  }
  return path;
}
