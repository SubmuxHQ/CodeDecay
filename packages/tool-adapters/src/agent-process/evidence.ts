import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  type Evidence,
  type EvidenceSeverity
} from "@submuxhq/codedecay-harness";
import { compactExecutionMetadata } from "../shared/execution";
import type { CodeDecayAgentBundleFormat, CodeDecayAgentProfile } from "../types";
import { AGENT_PROCESS_HARNESS_NAME } from "./constants";
import type { AgentProcessBundle } from "./types";

export function agentProcessMissingCommandEvidence(
  profile: CodeDecayAgentProfile,
  bundleFormat: CodeDecayAgentBundleFormat
): Evidence {
  return createEvidence({
    source: { kind: "agent", name: "Agent Process", id: AGENT_PROCESS_HARNESS_NAME },
    kind: "agent-suggestion",
    severity: "info",
    summary: "Agent process was skipped because no local agent command was configured.",
    trusted: false,
    metadata: {
      status: "skipped",
      profile,
      bundleFormat,
      untrusted: true
    }
  });
}

export function agentProcessEvidenceFromExecution(
  execution: CommandExecutionResult,
  bundle: AgentProcessBundle,
  profile: CodeDecayAgentProfile
): Evidence {
  const metadata = {
    ...compactExecutionMetadata(execution),
    profile,
    bundleFormat: bundle.bundleFormat,
    bundlePath: bundle.artifactPath,
    untrusted: true
  };

  return createEvidence({
    source: { kind: "agent", name: "Agent Process", id: AGENT_PROCESS_HARNESS_NAME },
    kind: "agent-suggestion",
    severity: agentProcessEvidenceSeverity(execution),
    summary: agentProcessEvidenceSummaryFromExecution(execution),
    trusted: false,
    command: execution.command,
    artifactPath: bundle.artifactPath,
    metadata
  });
}

export function agentProcessEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    const output = firstNonEmptyLine(execution.stdout) ?? firstNonEmptyLine(execution.stderr);
    return output
      ? `Agent process produced untrusted suggestions: ${output}`
      : "Agent process completed without producing output.";
  }

  if (execution.status === "skipped") {
    return "Agent process was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Agent process command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Agent process command timed out.";
  }

  if (execution.status === "error") {
    return `Agent process command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Agent process command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

export function agentProcessFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Agent process command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Agent process command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return agentProcessEvidenceSummaryFromExecution(execution);
}

function agentProcessEvidenceSeverity(execution: CommandExecutionResult): EvidenceSeverity {
  if (execution.status === "passed") {
    return execution.stdout.trim() || execution.stderr.trim() ? "low" : "info";
  }

  if (execution.status === "skipped") {
    return "info";
  }

  return "high";
}

function firstNonEmptyLine(value: string): string | undefined {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);

  if (!line) {
    return undefined;
  }

  const limit = 180;
  return line.length <= limit ? line : `${line.slice(0, limit)}...`;
}
