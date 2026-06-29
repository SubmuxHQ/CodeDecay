import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import { createEvidence, type Evidence } from "@submuxhq/codedecay-harness";
import {
  compactSemgrepFindingMetadata,
  findingsAtOrAboveThreshold,
  highestSemgrepEvidenceSeverity,
  semgrepFindingSummary
} from "./report";
import type { SemgrepReportAnalysis } from "./types";
import { compactExecutionMetadata, evidenceSeverityFromExecution } from "../shared/execution";
import type { CodeDecayToolSeverity } from "../types";

export function semgrepEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Semgrep",
      id: "semgrep"
    },
    kind: "static-analysis",
    severity: evidenceSeverityFromExecution(execution),
    summary: semgrepEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

export function semgrepEvidenceFromReport(
  report: SemgrepReportAnalysis | undefined,
  command: string,
  failOnSeverity: CodeDecayToolSeverity
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseError) {
    return [
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: "high",
        summary: report.parseError,
        trusted: true,
        command,
        artifactPath: report.artifactPath,
        metadata: {
          reportPath: report.artifactPath
        }
      })
    ];
  }

  const thresholdFindings = findingsAtOrAboveThreshold(report.findings, failOnSeverity);
  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "Semgrep", id: "semgrep" },
    kind: "static-analysis",
    severity: report.findings.length === 0 ? "info" : thresholdFindings.length > 0 ? "high" : highestSemgrepEvidenceSeverity(report.findings),
    summary:
      report.findings.length > 0
        ? `Semgrep found ${report.findings.length} finding(s); ${thresholdFindings.length} at or above ${failOnSeverity} severity.`
        : "Semgrep found no findings.",
    trusted: true,
    command,
    artifactPath: report.artifactPath,
    metadata: {
      reportPath: report.artifactPath,
      findingCount: report.findings.length,
      failOnSeverity,
      thresholdFindingCount: thresholdFindings.length
    }
  });

  return [
    summaryEvidence,
    ...report.findings.slice(0, 10).map((finding) =>
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: finding.severity,
        summary: semgrepFindingSummary(finding),
        trusted: true,
        file: finding.path,
        line: finding.line,
        command,
        artifactPath: report.artifactPath,
        metadata: compactSemgrepFindingMetadata(finding)
      })
    )
  ];
}

export function semgrepEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Semgrep static analysis command passed.";
  }

  if (execution.status === "skipped") {
    return "Semgrep static analysis was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Semgrep command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Semgrep command timed out.";
  }

  if (execution.status === "error") {
    return `Semgrep command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Semgrep command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

export function semgrepFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Semgrep command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Semgrep command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return semgrepEvidenceSummaryFromExecution(execution);
}
