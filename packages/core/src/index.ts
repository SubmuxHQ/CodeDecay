import { dedupeStrings } from "./collections";
import { findingCounts, sortFindings } from "./findings";
import { sortProductFailureBundles } from "./product-failures";
import { compareRiskLevels, riskLevelFromScore, type RiskLevel } from "./risk";
import { calculateDecayBreakdown, calculateMergeRiskBreakdown, type ScoreBreakdown } from "./scoring";
import type {
  AnalyzerResult,
  CodeDecayReport,
  FileChange,
  Finding,
  ImpactedArea,
  ImpactedRoute,
  ProductFailureBundle
} from "./types";
import { CODEDECAY_VERSION } from "./version";

export { compareRiskLevels, riskLevelFromScore, shouldFailForRisk } from "./risk";
export { dedupeStrings } from "./collections";
export { findingCounts, sortFindings } from "./findings";
export { productFailureBundlesFromProductTargetReport } from "./product-failures";
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
  TestEvidenceMode,
  TestEvidenceSource,
  TestEvidenceSummary
} from "./types";
export { CODEDECAY_VERSION } from "./version";

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

function mergeImpactedRoutes(routes: ImpactedRoute[]): ImpactedRoute[] {
  const merged = new Map<string, ImpactedRoute>();

  for (const route of routes) {
    const key = `${route.framework}:${route.kind}:${route.route}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...route,
        methods: dedupeStrings(route.methods),
        files: dedupeStrings(route.files),
        reasons: dedupeStrings(route.reasons),
        recommendedTests: dedupeStrings(route.recommendedTests)
      });
      continue;
    }

    existing.methods = dedupeStrings([...existing.methods, ...route.methods]);
    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
    existing.recommendedTests = dedupeStrings([...existing.recommendedTests, ...route.recommendedTests]);
    if (compareRiskLevels(route.risk, existing.risk) > 0) {
      existing.risk = route.risk;
    }
  }

  return [...merged.values()].sort((left, right) => {
    const risk = compareRiskLevels(right.risk, left.risk);
    if (risk !== 0) {
      return risk;
    }

    return `${left.framework}:${left.route}`.localeCompare(`${right.framework}:${right.route}`);
  });
}

function mergeImpactedAreas(areas: ImpactedArea[]): ImpactedArea[] {
  const merged = new Map<string, ImpactedArea>();

  for (const area of areas) {
    const key = `${area.kind}:${area.name}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...area,
        files: dedupeStrings(area.files)
      });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...area.files]);
    if (compareRiskLevels(area.risk, existing.risk) > 0) {
      existing.risk = area.risk;
    }
  }

  return [...merged.values()].sort((left, right) => {
    const risk = compareRiskLevels(right.risk, left.risk);
    if (risk !== 0) {
      return risk;
    }

    return left.name.localeCompare(right.name);
  });
}
