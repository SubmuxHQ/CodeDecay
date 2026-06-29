import {
  dedupeStrings,
  type ChangedSourceCoverage,
  type FileChange,
  type RuntimeCoverageSourceKind,
  type TestEvidenceSource
} from "@submuxhq/codedecay-core";
import type { RuntimeCoverageLineMapEntry } from "./types";
import { dedupeNumbers } from "./utils";

export function classifyChangedSourceCoverage(
  change: FileChange,
  entry: RuntimeCoverageLineMapEntry | undefined
): ChangedSourceCoverage {
  const changedLines = dedupeNumbers(change.addedLines.map((line) => line.line));

  if (!entry) {
    return {
      path: change.path,
      status: "not_measured",
      measuredLines: [],
      coveredLines: [],
      uncoveredLines: [],
      sourceKinds: [],
      sourcePaths: []
    };
  }

  const measuredLines = changedLines.filter((line) => entry.measured.has(line));
  const coveredLines = measuredLines.filter((line) => entry.covered.has(line));
  const uncoveredLines = measuredLines.filter((line) => !entry.covered.has(line));
  const status =
    measuredLines.length === 0
      ? "not_measured"
      : coveredLines.length === 0
        ? "not_covered"
        : coveredLines.length < measuredLines.length
          ? "partial"
          : "covered";

  return {
    path: change.path,
    status,
    measuredLines,
    coveredLines,
    uncoveredLines,
    sourceKinds: dedupeStrings([...entry.sourceKinds]) as RuntimeCoverageSourceKind[],
    sourcePaths: dedupeStrings([...entry.sourcePaths])
  };
}

export function buildRuntimeCoverageNotes(
  sources: TestEvidenceSource[],
  changedSources: ChangedSourceCoverage[]
): string[] {
  if (sources.length === 0) {
    return ["No runtime coverage artifact was found. Test audit remains heuristic-only."];
  }

  const notMeasured = changedSources.filter((entry) => entry.status === "not_measured").map((entry) => entry.path);
  if (notMeasured.length === 0) {
    return ["Runtime coverage artifacts were found for the changed source files."];
  }

  return [`Runtime coverage artifacts were found, but some changed paths were not measured: ${notMeasured.join(", ")}.`];
}
