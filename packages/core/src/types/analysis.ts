import type { Finding } from "./findings";
import type { ImpactedArea, ImpactedRoute, SymbolImpact, SymbolImpactGraphSummary } from "./impact";
import type { LanguageAnalysisSummary } from "./language";
import type { SecurityAnalysisSummary, SecurityCandidate } from "./security";
import type { TestEvidenceSummary } from "./test-evidence";

export interface AnalyzerResult {
  findings: Finding[];
  impactedAreas: ImpactedArea[];
  impactedRoutes?: ImpactedRoute[] | undefined;
  symbolImpactGraph?: SymbolImpactGraphSummary | undefined;
  symbolImpacts?: SymbolImpact[] | undefined;
  languageAnalysis?: LanguageAnalysisSummary | undefined;
  securityAnalysis?: SecurityAnalysisSummary | undefined;
  securityCandidates?: SecurityCandidate[] | undefined;
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
}
