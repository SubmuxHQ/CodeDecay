import type {
  CodeDecayReport,
} from "@submuxhq/codedecay-core";
import {
  appendChangedFiles,
  appendFindings,
  appendImpactedAreas,
  appendImpactedRoutes,
  appendLanguageAnalysis,
  appendProductFailureBundles,
  appendRecommendedChecks,
  appendReportNotes,
  appendScoreBreakdown,
  appendSecurityAnalysis,
  appendSecurityCandidates,
  appendSummaryTables,
  appendTestEvidence
} from "./markdown/sections";

export function renderMarkdownReport(report: CodeDecayReport): string {
  const highFindings = report.findings.filter((finding) => finding.severity === "high");
  const mediumFindings = report.findings.filter((finding) => finding.severity === "medium");
  const lowFindings = report.findings.filter((finding) => finding.severity === "low");

  const lines: string[] = [
    "## CodeDecay Report",
    ""
  ];

  appendSummaryTables(lines, report);
  appendChangedFiles(lines, report);
  appendImpactedAreas(lines, report);
  appendImpactedRoutes(lines, report);
  appendLanguageAnalysis(lines, report.languageAnalysis);
  appendScoreBreakdown(lines, "Merge Risk Breakdown", report.summary.mergeRiskBreakdown);
  appendScoreBreakdown(lines, "Decay Risk Breakdown", report.summary.decayBreakdown);
  appendScoreBreakdown(lines, "Security Risk Breakdown", report.summary.securityBreakdown);
  appendSecurityAnalysis(lines, report.securityAnalysis);
  appendSecurityCandidates(lines, report.securityCandidates);
  appendTestEvidence(lines, report.testEvidence);
  appendProductFailureBundles(lines, report.productFailureBundles);

  appendFindings(lines, "High Risk Findings", highFindings);
  appendFindings(lines, "Medium Risk Findings", mediumFindings);
  appendFindings(lines, "Low Risk Findings", lowFindings);

  appendRecommendedChecks(lines, report);
  appendReportNotes(lines);

  return `${lines.join("\n")}\n`;
}
