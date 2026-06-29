import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";

export function summarizeReportForLlmReview(report: CodeDecayReport | undefined): Record<string, unknown> | undefined {
  if (!report) {
    return undefined;
  }

  const testAudit = createTestProofAudit(report);
  return {
    summary: {
      mergeRiskScore: report.summary.mergeRiskScore,
      decayScore: report.summary.decayScore,
      riskLevel: report.summary.riskLevel,
      findingCounts: report.summary.findingCounts,
      mergeRiskBreakdown: report.summary.mergeRiskBreakdown,
      decayBreakdown: report.summary.decayBreakdown,
      testEvidence: report.testEvidence,
      testAuditStatus: testAudit.status,
      evidenceMode: testAudit.evidenceMode
    },
    changedFiles: report.changedFiles.map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions
    })),
    impactedAreas: report.impactedAreas,
    impactedRoutes: report.impactedRoutes ?? [],
    findings: report.findings.slice(0, 20),
    recommendedTests: report.recommendedTests.slice(0, 20)
  };
}
