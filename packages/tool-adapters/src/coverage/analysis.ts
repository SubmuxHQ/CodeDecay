import { dedupeNumbers, dedupeStrings } from "../shared/values";
import { findCoverageArtifacts } from "./discovery";
import { readIstanbulCoverage, readLcovCoverage, readV8Coverage } from "./parsers";
import type {
  CoverageArtifactSource,
  CoverageLineMapEntry,
  CoverageReportAnalysis,
  CoverageSourceKind
} from "./types";

export function analyzeCoverageReports(cwd: string, reportPaths: string[] | undefined): CoverageReportAnalysis | undefined {
  const artifacts = findCoverageArtifacts(cwd, reportPaths);
  if (artifacts.length === 0) {
    return undefined;
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  const sources: CoverageArtifactSource[] = [];
  const parseErrors: string[] = [];

  for (const artifact of artifacts) {
    const parsed =
      artifact.kind === "istanbul"
        ? readIstanbulCoverage(cwd, artifact.absolutePath)
        : artifact.kind === "lcov"
          ? readLcovCoverage(cwd, artifact.absolutePath)
          : readV8Coverage(cwd, artifact.absolutePath);

    if (parsed.parseError) {
      parseErrors.push(parsed.parseError);
      continue;
    }

    if (parsed.linesByFile.size === 0) {
      continue;
    }

    sources.push({
      kind: artifact.kind,
      path: artifact.relativePath
    });

    for (const [path, lines] of parsed.linesByFile) {
      mergeCoverageEntry(linesByFile, path, lines);
    }
  }

  if (sources.length === 0 && parseErrors.length === 0) {
    return undefined;
  }

  const files = [...linesByFile.entries()]
    .map(([path, entry]) => {
      const measuredLines = dedupeNumbers([...entry.measured]);
      const coveredLines = measuredLines.filter((line) => entry.covered.has(line));
      const uncoveredLines = measuredLines.filter((line) => !entry.covered.has(line));
      return {
        path,
        measuredLines,
        coveredLines,
        uncoveredLines,
        sourceKinds: dedupeStrings([...entry.sourceKinds]) as CoverageSourceKind[],
        sourcePaths: dedupeStrings([...entry.sourcePaths])
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    sources: dedupeCoverageSources(sources),
    files,
    totals: {
      files: files.length,
      measuredLines: files.reduce((sum, file) => sum + file.measuredLines.length, 0),
      coveredLines: files.reduce((sum, file) => sum + file.coveredLines.length, 0),
      uncoveredLines: files.reduce((sum, file) => sum + file.uncoveredLines.length, 0)
    },
    parseErrors
  };
}

function mergeCoverageEntry(target: Map<string, CoverageLineMapEntry>, path: string, entry: CoverageLineMapEntry): void {
  const existing =
    target.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<CoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies CoverageLineMapEntry);

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

function dedupeCoverageSources(sources: CoverageArtifactSource[]): CoverageArtifactSource[] {
  const seen = new Set<string>();
  const deduped: CoverageArtifactSource[] = [];

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
