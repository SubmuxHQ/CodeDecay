import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { sarifFindingResults, sarifProductFailureResults } from "./sarif/results";
import { sarifFindingRules, sarifProductFailureRules } from "./sarif/rules";

export function renderSarifReport(report: CodeDecayReport): string {
  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "CodeDecay",
              informationUri: "https://github.com/SubmuxHQ/CodeDecay",
              rules: [...sarifFindingRules(report), ...sarifProductFailureRules(report)]
            }
          },
          results: [...sarifFindingResults(report), ...sarifProductFailureResults(report)],
          properties: {
            mergeRiskScore: report.summary.mergeRiskScore,
            decayScore: report.summary.decayScore,
            securityScore: report.summary.securityScore,
            mergeRiskBreakdown: report.summary.mergeRiskBreakdown,
            decayBreakdown: report.summary.decayBreakdown,
            securityBreakdown: report.summary.securityBreakdown,
            securityAnalysis: report.securityAnalysis,
            securityCandidates: report.securityCandidates,
            testEvidence: report.testEvidence,
            productFailureBundles: report.productFailureBundles
          }
        }
      ]
    },
    null,
    2
  )}\n`;
}
