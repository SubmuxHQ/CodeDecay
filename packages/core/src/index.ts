export { dedupeStrings } from "./collections";
export {
  auditProjectPath,
  CODEDECAY_AUDIT_DATA_DIR,
  CODEDECAY_AUDIT_SCHEMA_VERSION,
  createAuditContentHash,
  createAuditProjectRecord,
  loadAuditProjectRecord,
  sanitizeAuditProjectId,
  saveAuditProjectRecord,
  upsertAuditFileRecord,
  upsertAuditRun
} from "./audit";
export { findingCounts, sortFindings } from "./findings";
export { isMemoryContextFinding } from "./finding-evidence";
export { isTestFilePath } from "./paths/test-files";
export { productFailureBundlesFromProductTargetReport } from "./product-failures";
export { normalizeRequirementContext } from "./requirements";
export { createRequirementTrace, hasBlockingRequirementTrace } from "./requirement-trace";
export { compareRiskLevels, riskLevelFromScore, shouldFailForRisk } from "./risk";
export {
  createRevalidationReport,
  revalidationSubjectId
} from "./revalidate";
export { createAnalysisReport } from "./report";
export type { RiskLevel } from "./risk";
export type {
  AcceptanceCriterion,
  AcceptanceCriterionInput,
  AffectedFlow,
  AffectedFlowInput,
  RequirementConfidence,
  RequirementContext,
  RequirementContextInput,
  RequirementFlowKind,
  RequirementSource,
  RequirementSourceKind,
  RequirementStatement,
  RequirementStatementInput
} from "./requirements";
export type { ScoreBreakdown, ScoreContributor, ScoreEvidenceKind } from "./scoring";
export { CODEDECAY_PRODUCT_LATEST_REPORT_PATH } from "./types";
export type {
  AnalyzerResult,
  AuditFileHistoryEntry,
  AuditFileRecord,
  AuditFileStatus,
  AuditLockMetadata,
  AuditProjectRecord,
  AuditRunRecord,
  AuditRunStatus,
  RevalidationCurrentFile,
  RevalidationInput,
  RevalidationItem,
  RevalidationItemKind,
  RevalidationMarkOptions,
  RevalidationMemorySuggestion,
  RevalidationReport,
  RevalidationStatus,
  ChangedLine,
  ChangedSourceCoverage,
  ChangedSourceCoverageStatus,
  CodeDecayReport,
  DesignBannedApiRule,
  DesignBoundaryRule,
  DesignContract,
  DesignDependencyRule,
  DesignMatcher,
  DesignPatternRule,
  DesignScopeFence,
  FileChange,
  FileStatus,
  Finding,
  FindingCategory,
  ImpactedArea,
  ImpactedRoute,
  SymbolCall,
  SymbolExport,
  SymbolGraphFile,
  SymbolImpact,
  SymbolImpactGraph,
  SymbolImpactGraphSummary,
  SymbolImport,
  SymbolImportEdge,
  LanguageAnalysisSummary,
  LanguageFileSupport,
  LanguageParserCapability,
  LanguageSupportStatus,
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
  TestEvidenceSummary,
  ChangedPathTestProofEntry,
  ChangedPathTestProofEvidence,
  ChangedPathTestProofMap,
  ChangedPathTestProofStatus,
  ChangedPathTestProofSummary,
  RequirementCriterionTrace,
  RequirementTraceAgentSuggestionInput,
  RequirementTraceEvidence,
  RequirementTraceEvidenceKind,
  RequirementTraceEvidenceOutcome,
  RequirementTraceExternalEvidence,
  RequirementTraceExternalStatus,
  RequirementTraceGraph,
  RequirementTraceImplementation,
  RequirementTraceStatus,
  RequirementTraceSummary
} from "./types";
export { CODEDECAY_VERSION } from "./version";
