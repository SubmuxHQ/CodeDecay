import { dedupeStrings } from "./collections";
import { findingCounts, sortFindings } from "./findings";
import { mergeImpactedAreas, mergeImpactedRoutes } from "./impact";
import { sortProductFailureBundles } from "./product-failures";
import { riskLevelFromScore } from "./risk";
import { calculateDecayBreakdown, calculateMergeRiskBreakdown } from "./scoring";
import type { AnalyzerResult, CodeDecayReport, FileChange, ProductFailureBundle } from "./types";
import { CODEDECAY_VERSION } from "./version";

export function createAnalysisReport(input: {
  base?: string | undefined;
  head?: string | undefined;
  changedFiles: FileChange[];
  analyzerResult: AnalyzerResult;
  productFailureBundles?: ProductFailureBundle[] | undefined;
  generatedAt?: string | undefined;
}): CodeDecayReport {
  const findings = sortFindings(input.analyzerResult.findings);
  const mergeRiskBreakdown = calculateMergeRiskBreakdown(findings, input.changedFiles);
  const decayBreakdown = calculateDecayBreakdown(findings, input.changedFiles);
  const mergeRiskScore = mergeRiskBreakdown.score;
  const decayScore = decayBreakdown.score;
  const riskLevel = riskLevelFromScore(Math.max(mergeRiskScore, decayScore));
  const impactedRoutes = mergeImpactedRoutes(input.analyzerResult.impactedRoutes ?? []);
  const routeRecommendedTests = impactedRoutes.flatMap((route) => route.recommendedTests);

  const report: CodeDecayReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      mergeRiskScore,
      decayScore,
      riskLevel,
      findingCounts: findingCounts(findings),
      mergeRiskBreakdown,
      decayBreakdown
    },
    changedFiles: input.changedFiles,
    impactedAreas: mergeImpactedAreas(input.analyzerResult.impactedAreas),
    findings,
    recommendedTests: dedupeStrings([...input.analyzerResult.recommendedTests, ...routeRecommendedTests])
  };

  if (impactedRoutes.length > 0) {
    report.impactedRoutes = impactedRoutes;
  }

  if (input.base) {
    report.base = input.base;
  }

  if (input.head) {
    report.head = input.head;
  }

  if (input.analyzerResult.testEvidence) {
    report.testEvidence = input.analyzerResult.testEvidence;
  }

  if (input.productFailureBundles && input.productFailureBundles.length > 0) {
    report.productFailureBundles = sortProductFailureBundles(input.productFailureBundles);
  }

  return report;
}
