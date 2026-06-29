import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import { createEvidence, type Evidence } from "@submuxhq/codedecay-harness";
import {
  compactExecutionMetadata,
  evidenceSeverityFromExecution
} from "../shared/execution";
import type { CodeDecayCoverageFailOn } from "../types";
import type { CoverageFileSummary, CoverageReportAnalysis } from "./types";

export function coverageEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Coverage",
      id: "coverage"
    },
    kind: "coverage",
    severity: evidenceSeverityFromExecution(execution),
    summary: coverageEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

export function coverageCollectionEvidence(command: string): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Coverage",
      id: "coverage"
    },
    kind: "coverage",
    severity: "info",
    summary: "Coverage adapter is collecting existing local coverage artifacts without running a command.",
    trusted: true,
    command,
    metadata: {
      status: "collected"
    }
  });
}

export function coverageEvidenceFromReport(
  report: CoverageReportAnalysis | undefined,
  command: string,
  failOn: CodeDecayCoverageFailOn
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseErrors.length > 0) {
    return [
      createEvidence({
        source: { kind: "tool", name: "Coverage", id: "coverage" },
        kind: "coverage",
        severity: "high",
        summary: `Could not parse ${report.parseErrors.length} coverage artifact(s).`,
        trusted: true,
        command,
        metadata: {
          parseErrors: report.parseErrors.slice(0, 5)
        }
      })
    ];
  }

  const uncoveredFiles = report.files.filter((file) => file.uncoveredLines.length > 0);
  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "Coverage", id: "coverage" },
    kind: "coverage",
    severity: failOn === "uncovered" && report.totals.uncoveredLines > 0 ? "high" : report.totals.uncoveredLines > 0 ? "medium" : "info",
    summary:
      report.totals.uncoveredLines > 0
        ? `Coverage artifacts measured ${report.totals.measuredLines} line(s); ${report.totals.uncoveredLines} line(s) are uncovered.`
        : `Coverage artifacts measured ${report.totals.measuredLines} covered line(s) across ${report.totals.files} file(s).`,
    trusted: true,
    command,
    metadata: {
      sources: report.sources,
      failOn,
      ...report.totals
    }
  });

  return [
    summaryEvidence,
    ...uncoveredFiles.slice(0, 10).map((file) =>
      createEvidence({
        source: { kind: "tool", name: "Coverage", id: "coverage" },
        kind: "coverage",
        severity: failOn === "uncovered" ? "high" : "medium",
        summary: `${file.path} has ${file.uncoveredLines.length} uncovered measured line(s).`,
        trusted: true,
        file: file.path,
        line: file.uncoveredLines[0],
        command,
        artifactPath: file.sourcePaths[0],
        metadata: compactCoverageFileMetadata(file)
      })
    )
  ];
}

export function coverageEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Coverage command passed.";
  }

  if (execution.status === "skipped") {
    return "Coverage command was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Coverage command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Coverage command timed out.";
  }

  if (execution.status === "error") {
    return `Coverage command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Coverage command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

export function coverageFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Coverage command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Coverage command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return coverageEvidenceSummaryFromExecution(execution);
}

function compactCoverageFileMetadata(file: CoverageFileSummary): Record<string, unknown> {
  return {
    measuredLines: file.measuredLines.length,
    coveredLines: file.coveredLines.length,
    uncoveredLines: file.uncoveredLines.length,
    firstUncoveredLines: file.uncoveredLines.slice(0, 10),
    sourceKinds: file.sourceKinds,
    sourcePaths: file.sourcePaths
  };
}
