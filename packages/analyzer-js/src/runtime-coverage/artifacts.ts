import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { RuntimeCoverageSourceKind } from "@submuxhq/codedecay-core";
import type { RuntimeCoverageArtifact } from "./types";
import { listCoverageFiles } from "./artifacts/discovery";
import { detectCoverageArtifactKind } from "./artifacts/kinds";

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
