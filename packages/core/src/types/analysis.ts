import type { Finding } from "./findings";
import type { ImpactedArea, ImpactedRoute, SymbolImpact, SymbolImpactGraphSummary } from "./impact";
import type { LanguageAnalysisSummary } from "./language";
import type { SecurityAnalysisSummary, SecurityCandidate } from "./security";
import type { TestEvidenceSummary } from "./test-evidence";
import type { ChangedPathTestProofMap } from "./test-proof";
import type { ImpactGraphSummary } from "../impact-graph";

export interface AnalyzerResult {
  findings: Finding[];
  impactedAreas: ImpactedArea[];
  impactedRoutes?: ImpactedRoute[] | undefined;
  impactGraph?: ImpactGraphSummary | undefined;
  symbolImpactGraph?: SymbolImpactGraphSummary | undefined;
  symbolImpacts?: SymbolImpact[] | undefined;
  languageAnalysis?: LanguageAnalysisSummary | undefined;
  securityAnalysis?: SecurityAnalysisSummary | undefined;
  securityCandidates?: SecurityCandidate[] | undefined;
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
  testProofMap?: ChangedPathTestProofMap | undefined;
}
