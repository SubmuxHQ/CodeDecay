export type CoverageSourceKind = "istanbul" | "lcov" | "v8";

export interface CoverageLineMapEntry {
  measured: Set<number>;
  covered: Set<number>;
  sourceKinds: Set<CoverageSourceKind>;
  sourcePaths: Set<string>;
}

export interface CoverageArtifact {
  kind: CoverageSourceKind;
  absolutePath: string;
  relativePath: string;
}

export interface CoverageArtifactSource {
  kind: CoverageSourceKind;
  path: string;
}

export interface CoverageFileSummary {
  path: string;
  measuredLines: number[];
  coveredLines: number[];
  uncoveredLines: number[];
  sourceKinds: CoverageSourceKind[];
  sourcePaths: string[];
}

export interface CoverageReportAnalysis {
  sources: CoverageArtifactSource[];
  files: CoverageFileSummary[];
  totals: {
    files: number;
    measuredLines: number;
    coveredLines: number;
    uncoveredLines: number;
  };
  parseErrors: string[];
}

export interface CoverageParseResult {
  linesByFile: Map<string, CoverageLineMapEntry>;
  parseError?: string | undefined;
}
