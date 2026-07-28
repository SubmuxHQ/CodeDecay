import type { RiskLevel } from "../risk";
import type { ScoreBreakdown } from "../scoring";
import type { ProductFailureBundle } from "../product-failures/types";
import type { FileChange } from "./file-change";
import type { Finding } from "./findings";
import type { ImpactedArea, ImpactedRoute, SymbolImpact, SymbolImpactGraphSummary } from "./impact";
import type { LanguageAnalysisSummary } from "./language";
import type { SecurityAnalysisSummary, SecurityCandidate } from "./security";
import type { TestEvidenceSummary } from "./test-evidence";
import type { ChangedPathTestProofMap } from "./test-proof";
import type { RequirementContext } from "../requirements";
import type { RequirementTraceGraph } from "./requirement-trace";
import type { ImpactGraphSummary } from "../impact-graph";

export interface ReportSummary {
  mergeRiskScore: number;
  decayScore: number;
  securityScore: number;
  riskLevel: RiskLevel;
  findingCounts: Record<RiskLevel, number>;
  mergeRiskBreakdown?: ScoreBreakdown | undefined;
  decayBreakdown?: ScoreBreakdown | undefined;
  securityBreakdown?: ScoreBreakdown | undefined;
}

export interface CodeDecayReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  base?: string | undefined;
  head?: string | undefined;
  summary: ReportSummary;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  impactedRoutes?: ImpactedRoute[] | undefined;
  impactGraph?: ImpactGraphSummary | undefined;
  symbolImpactGraph?: SymbolImpactGraphSummary | undefined;
  symbolImpacts?: SymbolImpact[] | undefined;
  languageAnalysis?: LanguageAnalysisSummary | undefined;
  securityAnalysis?: SecurityAnalysisSummary | undefined;
  securityCandidates?: SecurityCandidate[] | undefined;
  findings: Finding[];
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
  testProofMap?: ChangedPathTestProofMap | undefined;
  productFailureBundles?: ProductFailureBundle[] | undefined;
  requirements?: RequirementContext | undefined;
  requirementTrace?: RequirementTraceGraph | undefined;
}
