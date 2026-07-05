import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeRegExp } from "./matchers";
import type { CodeownersEntry, CodeownersIndex } from "./types";

const CODEOWNERS_CANDIDATE_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

export function loadCodeowners(rootDir: string): CodeownersIndex {
  for (const sourcePath of CODEOWNERS_CANDIDATE_PATHS) {
    try {
      return {
        sourcePath,
        entries: parseCodeowners(readFileSync(join(rootDir, sourcePath), "utf8"))
      };
    } catch {
      continue;
    }
  }

  return { entries: [] };
}

export function formatOwnershipEvidence(
  codeowners: CodeownersIndex,
  importerPath: string,
  targetPath: string
): string | undefined {
  if (codeowners.entries.length === 0) {
    return undefined;
  }

  const importerOwners = ownersForPath(codeowners, importerPath);
  const targetOwners = ownersForPath(codeowners, targetPath);
  const parts = [
    importerOwners ? `changed file owners ${importerOwners.owners.join(", ")}` : undefined,
    targetOwners ? `imported target owners ${targetOwners.owners.join(", ")}` : undefined
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return `CODEOWNERS source: ${codeowners.sourcePath}. No matching owners found for changed file or imported target.`;
  }

  return `CODEOWNERS source: ${codeowners.sourcePath}. ${parts.join("; ")}.`;
}

function parseCodeowners(content: string): CodeownersEntry[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      const normalizedOwners = owners.filter((owner) => owner.length > 0 && !owner.startsWith("#"));
      if (!pattern || normalizedOwners.length === 0) {
        return [];
      }

      return [{
        pattern,
        owners: normalizedOwners
      }];
    });
}

function ownersForPath(
  codeowners: CodeownersIndex,
  path: string
): { owners: string[]; pattern: string } | undefined {
  let matched: { owners: string[]; pattern: string } | undefined;

  for (const entry of codeowners.entries) {
    if (matchesCodeownersPattern(path, entry.pattern)) {
      matched = {
        owners: entry.owners,
        pattern: entry.pattern
      };
    }
  }

  return matched;
}

function matchesCodeownersPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRepoPath(path);
  let normalizedPattern = normalizeRepoPath(pattern.trim());
  if (!normalizedPattern || normalizedPattern.startsWith("!")) {
    return false;
  }

  const rooted = normalizedPattern.startsWith("/");
  normalizedPattern = normalizedPattern.replace(/^\/+/, "");
  const filenameOnly = !normalizedPattern.includes("/");

  if (normalizedPattern.endsWith("/")) {
    normalizedPattern = `${normalizedPattern}**`;
  }

  if (!containsGlob(normalizedPattern)) {
    if (filenameOnly) {
      return normalizedPath.split("/").at(-1) === normalizedPattern;
    }

    return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
  }

  const regexSource = globToRegex(normalizedPattern);
  const regex = filenameOnly && !rooted
    ? new RegExp(`(^|/)${regexSource}$`)
    : new RegExp(`^${regexSource}$`);
  return regex.test(normalizedPath);
}

function globToRegex(pattern: string): string {
  let regex = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const next = pattern[index + 1];
    if (!character) {
      continue;
    }

    if (character === "*" && next === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      regex += "[^/]*";
      continue;
    }

    if (character === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegExp(character);
  }

  return regex;
}

function containsGlob(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function normalizeRepoPath(path: string): string {
  return path.replaceAll("\\", "/");
}
