import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import { createEvidence, type Evidence } from "@submuxhq/codedecay-harness";
import { compactExecutionMetadata, evidenceSeverityFromExecution } from "../shared/execution";

export function schemathesisEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Schemathesis",
      id: "schemathesis"
    },
    kind: "api-fuzz",
    severity: evidenceSeverityFromExecution(execution),
    summary: schemathesisEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

export function schemathesisEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Schemathesis API fuzzing passed.";
  }

  if (execution.status === "skipped") {
    return "Schemathesis API fuzzing was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Schemathesis command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Schemathesis command timed out.";
  }

  if (execution.status === "error") {
    return `Schemathesis command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Schemathesis command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

export function schemathesisFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Schemathesis command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Schemathesis command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return schemathesisEvidenceSummaryFromExecution(execution);
}
