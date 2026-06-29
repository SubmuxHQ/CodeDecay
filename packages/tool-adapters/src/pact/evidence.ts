import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import { createEvidence, type Evidence } from "@submuxhq/codedecay-harness";
import { compactExecutionMetadata, evidenceSeverityFromExecution } from "../shared/execution";

export function pactEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Pact",
      id: "pact"
    },
    kind: "contract",
    severity: evidenceSeverityFromExecution(execution),
    summary: pactEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

export function pactEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Pact contract tests passed.";
  }

  if (execution.status === "skipped") {
    return "Pact contract tests were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Pact command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Pact command timed out.";
  }

  if (execution.status === "error") {
    return `Pact command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Pact command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

export function pactFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Pact command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Pact command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return pactEvidenceSummaryFromExecution(execution);
}
