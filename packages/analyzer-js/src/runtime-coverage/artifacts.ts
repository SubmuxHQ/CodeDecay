import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { RuntimeCoverageSourceKind } from "@submuxhq/codedecay-core";
import type { RuntimeCoverageArtifact } from "./types";
import { normalizePath } from "./utils";

export function findCoverageArtifacts(rootDir: string): RuntimeCoverageArtifact[] {
  const discovered = new Map<string, RuntimeCoverageArtifact>();
  const explicitCandidates: Array<{ kind: RuntimeCoverageSourceKind; absolutePath: string }> = [
    { kind: "istanbul", absolutePath: join(rootDir, "coverage", "coverage-final.json") },
    { kind: "istanbul", absolutePath: join(rootDir, "coverage-final.json") },
    { kind: "lcov", absolutePath: join(rootDir, "coverage", "lcov.info") },
    { kind: "lcov", absolutePath: join(rootDir, "lcov.info") }
  ];

  for (const candidate of explicitCandidates) {
    if (existsSync(candidate.absolutePath)) {
      discovered.set(candidate.absolutePath, {
        ...candidate,
        relativePath: relative(rootDir, candidate.absolutePath).replaceAll("\\", "/")
      });
    }
  }

  for (const directory of ["coverage", ".v8-coverage", ".nyc_output"]) {
    const absoluteDir = join(rootDir, directory);
    if (!existsSync(absoluteDir)) {
      continue;
    }

    for (const file of listCoverageFiles(rootDir, absoluteDir)) {
      const kind = detectCoverageArtifactKind(file);
      if (!kind) {
        continue;
      }

      discovered.set(file, {
        kind,
        absolutePath: file,
        relativePath: relative(rootDir, file).replaceAll("\\", "/")
      });
    }
  }

  return [...discovered.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function listCoverageFiles(rootDir: string, currentDir: string): string[] {
  const files: string[] = [];
  const relativeDir = relative(rootDir, currentDir).replaceAll("\\", "/");
  if (relativeDir.startsWith("..")) {
    return files;
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCoverageFiles(rootDir, absolutePath));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function detectCoverageArtifactKind(absolutePath: string): RuntimeCoverageSourceKind | undefined {
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
