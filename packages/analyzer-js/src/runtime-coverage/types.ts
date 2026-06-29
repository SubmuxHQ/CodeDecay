import type {
  Finding,
  RuntimeCoverageSourceKind,
  TestEvidenceSource,
  TestEvidenceSummary
} from "@submuxhq/codedecay-core";

export interface RuntimeCoverageLineMapEntry {
  measured: Set<number>;
  covered: Set<number>;
  sourceKinds: Set<RuntimeCoverageSourceKind>;
  sourcePaths: Set<string>;
}

export interface RuntimeCoverageData {
  sources: TestEvidenceSource[];
  linesByFile: Map<string, RuntimeCoverageLineMapEntry>;
}

export interface RuntimeCoverageAnalysis {
  findings: Finding[];
  recommendedTests: string[];
  testEvidence: TestEvidenceSummary;
}

export interface RuntimeCoverageArtifact {
  kind: RuntimeCoverageSourceKind;
  absolutePath: string;
  relativePath: string;
}
