import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { normalizeArtifactPath, normalizePath } from "../shared/paths";
import { DEFAULT_COVERAGE_DISCOVERY_DIRS, DEFAULT_COVERAGE_REPORT_PATHS } from "./constants";
import type { CoverageArtifact, CoverageSourceKind } from "./types";

export function findCoverageArtifacts(cwd: string, reportPaths: string[] | undefined): CoverageArtifact[] {
  const discovered = new Map<string, CoverageArtifact>();
  const candidates = reportPaths ?? DEFAULT_COVERAGE_REPORT_PATHS;

  for (const candidate of candidates) {
    collectCoverageCandidate(cwd, candidate, discovered);
  }

  if (reportPaths === undefined) {
    for (const directory of DEFAULT_COVERAGE_DISCOVERY_DIRS) {
      collectCoverageCandidate(cwd, directory, discovered);
    }
  }

  return [...discovered.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function collectCoverageCandidate(cwd: string, candidate: string, discovered: Map<string, CoverageArtifact>): void {
  const absolutePath = isAbsolute(candidate) ? candidate : join(cwd, candidate);
  if (!existsSync(absolutePath)) {
    return;
  }

  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    for (const file of listCoverageFiles(cwd, absolutePath)) {
      addCoverageArtifact(cwd, file, discovered);
    }
    return;
  }

  addCoverageArtifact(cwd, absolutePath, discovered);
}

function listCoverageFiles(cwd: string, currentDir: string): string[] {
  const relativeDir = relative(cwd, currentDir).replaceAll("\\", "/");
  if (relativeDir.startsWith("..")) {
    return [];
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCoverageFiles(cwd, absolutePath));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

function addCoverageArtifact(cwd: string, absolutePath: string, discovered: Map<string, CoverageArtifact>): void {
  const kind = detectCoverageArtifactKind(absolutePath);
  if (!kind) {
    return;
  }

  discovered.set(absolutePath, {
    kind,
    absolutePath,
    relativePath: normalizeArtifactPath(cwd, absolutePath)
  });
}

function detectCoverageArtifactKind(absolutePath: string): CoverageSourceKind | undefined {
  const normalized = normalizePath(absolutePath).toLowerCase();
  if (normalized.endsWith("/coverage-final.json") || normalized.endsWith("coverage-final.json")) {
    return "istanbul";
  }

  if (normalized.endsWith("/lcov.info") || normalized.endsWith("lcov.info")) {
    return "lcov";
  }

  if (normalized.endsWith(".json")) {
    return "v8";
  }

  return undefined;
}
