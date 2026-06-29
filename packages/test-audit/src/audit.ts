import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { sortFindings } from "@submuxhq/codedecay-core";
import { classifyTestProof, summarizeEvidence, summarizeStatus } from "./classification";
import { isChangedSourceFile, isTestPath } from "./paths";
import { recommendStrongerChecks } from "./recommendations";
import { isMissingTestRule, isWeakTestRule } from "./rules";
import type { TestProofAudit } from "./types";

export function createTestProofAudit(report: CodeDecayReport): TestProofAudit {
  const changedSourceFiles = report.changedFiles
    .filter((change) => isChangedSourceFile(change))
    .map((change) => change.path)
    .sort((left, right) => left.localeCompare(right));
  const changedTestFiles = report.changedFiles
    .filter((change) => change.status !== "deleted" && isTestPath(change.path))
    .map((change) => change.path)
    .sort((left, right) => left.localeCompare(right));
  const runtimeCoverage = (report.testEvidence?.changedSources ?? []).filter((entry) => changedSourceFiles.includes(entry.path));
  const missingTestFindings = sortFindings(report.findings.filter((finding) => isMissingTestRule(finding.ruleId)));
  const weakTestFindings = sortFindings(report.findings.filter((finding) => isWeakTestRule(finding.ruleId)));
  const status = classifyTestProof({
    changedSourceFiles,
    changedTestFiles,
    runtimeCoverage,
    missingTestFindings,
    weakTestFindings
  });
  const evidenceMode = report.testEvidence?.mode ?? "heuristic_only";

  return {
    status,
    summary: summarizeStatus(status, evidenceMode),
    evidenceMode,
    evidenceSummary: summarizeEvidence(evidenceMode, runtimeCoverage),
    changedSourceFiles,
    changedTestFiles,
    runtimeCoverage,
    missingTestFindings,
    weakTestFindings,
    recommendedChecks: recommendStrongerChecks({
      report,
      status,
      changedSourceFiles,
      changedTestFiles,
      runtimeCoverage,
      missingTestFindings,
      weakTestFindings
    })
  };
}
