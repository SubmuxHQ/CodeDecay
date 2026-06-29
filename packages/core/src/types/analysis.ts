import type { Finding } from "./findings";
import type { ImpactedArea, ImpactedRoute } from "./impact";
import type { SecurityAnalysisSummary, SecurityCandidate } from "./security";
import type { TestEvidenceSummary } from "./test-evidence";

export interface AnalyzerResult {
  findings: Finding[];
  impactedAreas: ImpactedArea[];
  impactedRoutes?: ImpactedRoute[] | undefined;
  securityAnalysis?: SecurityAnalysisSummary | undefined;
  securityCandidates?: SecurityCandidate[] | undefined;
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
}
