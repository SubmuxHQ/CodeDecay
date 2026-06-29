export type RuntimeCoverageSourceKind = "istanbul" | "lcov" | "v8";

export interface TestEvidenceSource {
  kind: RuntimeCoverageSourceKind;
  path: string;
}

export type ChangedSourceCoverageStatus = "covered" | "partial" | "not_covered" | "not_measured";

export interface ChangedSourceCoverage {
  path: string;
  status: ChangedSourceCoverageStatus;
  measuredLines: number[];
  coveredLines: number[];
  uncoveredLines: number[];
  sourceKinds: RuntimeCoverageSourceKind[];
  sourcePaths: string[];
}

export type TestEvidenceMode = "heuristic_only" | "runtime_augmented";

export interface TestEvidenceSummary {
  mode: TestEvidenceMode;
  sources: TestEvidenceSource[];
  changedSources: ChangedSourceCoverage[];
  notes: string[];
}
