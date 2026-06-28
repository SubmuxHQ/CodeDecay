import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";

export function evidenceSeverityFromExecution(execution: CommandExecutionResult): "info" | "high" {
  return execution.status === "passed" || execution.status === "skipped" ? "info" : "high";
}

export function compactExecutionMetadata(execution: CommandExecutionResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    status: execution.status,
    durationMs: execution.durationMs
  };

  if (execution.exitCode !== undefined) {
    metadata.exitCode = execution.exitCode;
  }

  if (execution.blockedReason) {
    metadata.blockedReason = execution.blockedReason;
  }

  if (execution.stdout.trim()) {
    metadata.stdout = trimOutput(execution.stdout);
  }

  if (execution.stderr.trim()) {
    metadata.stderr = trimOutput(execution.stderr);
  }

  return metadata;
}

export function failureModeFromExecution(
  execution: CommandExecutionResult
): "command-denied" | "unsafe-command" | "timeout" | "internal-error" | "nonzero-exit" {
  if (execution.status === "skipped") {
    return "command-denied";
  }

  if (execution.status === "blocked") {
    return "unsafe-command";
  }

  if (execution.status === "timed_out") {
    return "timeout";
  }

  if (execution.status === "error") {
    return "internal-error";
  }

  return "nonzero-exit";
}

export function harnessStatusFromExecution(execution: CommandExecutionResult): "skipped" | "failed" | "timed_out" | "error" {
  if (execution.status === "skipped" || execution.status === "blocked") {
    return "skipped";
  }

  if (execution.status === "timed_out") {
    return "timed_out";
  }

  if (execution.status === "error") {
    return "error";
  }

  return "failed";
}

function trimOutput(output: string): string {
  const trimmed = output.trim();
  const limit = 2000;
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(trimmed.length - limit)}\n[output truncated to last ${limit} characters]`;
}
