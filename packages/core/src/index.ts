export { dedupeStrings } from "./collections";
export { findingCounts, sortFindings } from "./findings";
export { productFailureBundlesFromProductTargetReport } from "./product-failures";
export { compareRiskLevels, riskLevelFromScore, shouldFailForRisk } from "./risk";
export { createAnalysisReport } from "./report";
export type { RiskLevel } from "./risk";
export type { ScoreBreakdown, ScoreContributor, ScoreEvidenceKind } from "./scoring";
export { CODEDECAY_PRODUCT_LATEST_REPORT_PATH } from "./types";
export type {
  AnalyzerResult,
  ChangedLine,
  ChangedSourceCoverage,
  ChangedSourceCoverageStatus,
  CodeDecayReport,
  FileChange,
  FileStatus,
  Finding,
  FindingCategory,
  ImpactedArea,
  ImpactedRoute,
  ProductCheckKind,
  ProductFailureArtifact,
  ProductFailureArtifactKind,
  ProductFailureBundle,
  ProductFailureClassification,
  ProductFailureStep,
  ProductFailureTarget,
  ReportSummary,
  RuntimeCoverageSourceKind,
  SecurityAnalysisSummary,
  SecurityCandidate,
  SecurityCandidateConfidence,
  SecuritySkippedFile,
  TestEvidenceMode,
  TestEvidenceSource,
  TestEvidenceSummary
} from "./types";
export { CODEDECAY_VERSION } from "./version";
