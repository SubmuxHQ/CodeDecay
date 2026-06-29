import type {
  ChangedSourceCoverage,
  CodeDecayReport,
  Finding,
  TestEvidenceMode
} from "@submuxhq/codedecay-core";

export type TestProofStatus = "missing" | "weak" | "present" | "not_applicable";

export interface TestProofAudit {
  status: TestProofStatus;
  summary: string;
  evidenceMode: TestEvidenceMode;
  evidenceSummary: string;
  changedSourceFiles: string[];
  changedTestFiles: string[];
  runtimeCoverage: ChangedSourceCoverage[];
  missingTestFindings: Finding[];
  weakTestFindings: Finding[];
  recommendedChecks: string[];
}

export interface TestProofClassificationInput {
  changedSourceFiles: string[];
  changedTestFiles: string[];
  runtimeCoverage: ChangedSourceCoverage[];
  missingTestFindings: Finding[];
  weakTestFindings: Finding[];
}

export interface StrongerChecksInput extends TestProofClassificationInput {
  report: CodeDecayReport;
  status: TestProofStatus;
}
