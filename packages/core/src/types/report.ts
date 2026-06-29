import type { RiskLevel } from "../risk";
import type { ScoreBreakdown } from "../scoring";
import type { ProductFailureBundle } from "../product-failures/types";
import type { FileChange } from "./file-change";
import type { Finding } from "./findings";
import type { ImpactedArea, ImpactedRoute } from "./impact";
import type { TestEvidenceSummary } from "./test-evidence";

export interface ReportSummary {
  mergeRiskScore: number;
  decayScore: number;
  riskLevel: RiskLevel;
  findingCounts: Record<RiskLevel, number>;
  mergeRiskBreakdown?: ScoreBreakdown | undefined;
  decayBreakdown?: ScoreBreakdown | undefined;
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
  findings: Finding[];
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
  productFailureBundles?: ProductFailureBundle[] | undefined;
}
