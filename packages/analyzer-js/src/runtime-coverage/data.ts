import { dedupeStrings, type RuntimeCoverageSourceKind, type TestEvidenceSource } from "@submuxhq/codedecay-core";
import { findCoverageArtifacts } from "./artifacts";
import { readIstanbulCoverage, readLcovCoverage, readV8Coverage } from "./parsers";
import type { RuntimeCoverageData, RuntimeCoverageLineMapEntry } from "./types";

export function loadRuntimeCoverageData(rootDir: string): RuntimeCoverageData {
  const sources: TestEvidenceSource[] = [];
  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();

  for (const artifact of findCoverageArtifacts(rootDir)) {
    const artifactLines =
      artifact.kind === "istanbul"
        ? readIstanbulCoverage(rootDir, artifact.absolutePath)
        : artifact.kind === "lcov"
          ? readLcovCoverage(rootDir, artifact.absolutePath)
          : readV8Coverage(rootDir, artifact.absolutePath);

    if (artifactLines.size === 0) {
      continue;
    }

    sources.push({
      kind: artifact.kind,
      path: artifact.relativePath
    });

    for (const [path, lines] of artifactLines) {
      mergeRuntimeCoverageEntry(linesByFile, path, lines);
    }
  }

  return {
    sources: dedupeCoverageSources(sources),
    linesByFile
  };
}

function mergeRuntimeCoverageEntry(
  target: Map<string, RuntimeCoverageLineMapEntry>,
  path: string,
  entry: RuntimeCoverageLineMapEntry
): void {
  const existing =
    target.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<RuntimeCoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies RuntimeCoverageLineMapEntry);

  for (const line of entry.measured) {
    existing.measured.add(line);
  }

  for (const line of entry.covered) {
    existing.covered.add(line);
  }

  for (const kind of entry.sourceKinds) {
    existing.sourceKinds.add(kind);
  }

  for (const sourcePath of entry.sourcePaths) {
    existing.sourcePaths.add(sourcePath);
  }

  target.set(path, existing);
}

function dedupeCoverageSources(sources: TestEvidenceSource[]): TestEvidenceSource[] {
  const seen = new Set<string>();
  const deduped: TestEvidenceSource[] = [];

  for (const source of sources) {
    const key = `${source.kind}:${source.path}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(source);
  }

  return deduped.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}
