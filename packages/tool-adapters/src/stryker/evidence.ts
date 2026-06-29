import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import { createEvidence, type Evidence } from "@submuxhq/codedecay-harness";
import {
  compactMutantMetadata,
  compactStrykerReportMetadata
} from "./report";
import type { StrykerMutationReportAnalysis } from "./types";
import { compactExecutionMetadata, evidenceSeverityFromExecution } from "../shared/execution";

export function strykerEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "StrykerJS",
      id: "stryker"
    },
    kind: "mutation",
    severity: evidenceSeverityFromExecution(execution),
    summary: strykerEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

export function strykerEvidenceFromReport(
  report: StrykerMutationReportAnalysis | undefined,
  command: string
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseError) {
    return [
      createEvidence({
        source: { kind: "tool", name: "StrykerJS", id: "stryker" },
        kind: "mutation",
        severity: "high",
        summary: report.parseError,
        trusted: true,
        command,
        artifactPath: report.reportPath,
        metadata: {
          reportPath: report.reportPath
        }
      })
    ];
  }

  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "StrykerJS", id: "stryker" },
    kind: "mutation",
    severity: report.weakMutants.length > 0 ? "high" : "info",
    summary:
      report.weakMutants.length > 0
        ? `StrykerJS found ${report.weakMutants.length} surviving or no-coverage mutant(s) in ${new Set(report.weakMutants.map((mutant) => mutant.file)).size} file(s).`
        : "StrykerJS report found no surviving or no-coverage mutants.",
    trusted: true,
    command,
    artifactPath: report.reportPath,
    metadata: compactStrykerReportMetadata(report)
  });

  return [
    summaryEvidence,
    ...report.weakMutants.slice(0, 5).map((mutant) =>
      createEvidence({
        source: { kind: "tool", name: "StrykerJS", id: "stryker" },
        kind: "mutation",
        severity: "high",
        summary: `${mutant.status} ${mutant.mutatorName ?? "mutation"} mutant in ${mutant.file}${mutant.line ? `:${mutant.line}` : ""}.`,
        trusted: true,
        file: mutant.file,
        line: mutant.line,
        command,
        artifactPath: report.reportPath,
        metadata: compactMutantMetadata(mutant)
      })
    )
  ];
}

export function strykerEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "StrykerJS mutation checks passed.";
  }

  if (execution.status === "skipped") {
    return "StrykerJS mutation checks were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `StrykerJS command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "StrykerJS command timed out.";
  }

  if (execution.status === "error") {
    return `StrykerJS command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `StrykerJS command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

export function strykerFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "StrykerJS command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `StrykerJS command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return strykerEvidenceSummaryFromExecution(execution);
}
