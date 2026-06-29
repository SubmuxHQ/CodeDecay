import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import {
  createHarnessFailureResult,
  type HarnessPlan,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { AgentProcessHarnessOptions } from "../types";
import { writeAgentProcessBundle } from "./bundle";
import {
  AGENT_PROCESS_HARNESS_NAME,
  DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT,
  DEFAULT_AGENT_PROCESS_PROFILE,
  DEFAULT_AGENT_PROCESS_TIMEOUT_MS
} from "./constants";
import {
  agentProcessEvidenceFromExecution,
  agentProcessEvidenceSummaryFromExecution,
  agentProcessFailureMessageFromExecution,
  agentProcessMissingCommandEvidence
} from "./evidence";
import { validateAgentProcessPlan } from "./validation";

export async function runAgentProcessPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: AgentProcessHarnessOptions
): Promise<HarnessRunResult> {
  validateAgentProcessPlan(plan);
  const startedAt = Date.now();
  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;
  const command = options.command;

  if (!command) {
    const durationMs = elapsed(startedAt);
    const evidence = [agentProcessMissingCommandEvidence(profile, bundleFormat)];

    return createHarnessFailureResult({
      harnessName: AGENT_PROCESS_HARNESS_NAME,
      mode: "missing-config",
      message: "Agent process requires toolAdapters.agentProcess.command before CodeDecay can run it.",
      status: "skipped",
      durationMs,
      evidence
    });
  }

  const bundle = writeAgentProcessBundle(context.cwd, context.context, profile, bundleFormat);
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_AGENT_PROCESS_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    env: {
      CODEDECAY_AGENT_BUNDLE_PATH: bundle.absolutePath,
      CODEDECAY_AGENT_BUNDLE_RELATIVE_PATH: bundle.artifactPath,
      CODEDECAY_AGENT_BUNDLE_FORMAT: bundle.bundleFormat,
      CODEDECAY_AGENT_PROFILE: profile,
      CODEDECAY_AGENT_OUTPUT_UNTRUSTED: "1"
    },
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const artifacts = [{ path: bundle.artifactPath, description: "CodeDecay agent task bundle passed to the local agent process." }];
  const evidence = [agentProcessEvidenceFromExecution(execution, bundle, profile)];

  if (execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: AGENT_PROCESS_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: agentProcessFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });

    return {
      ...failed,
      artifacts
    };
  }

  return {
    harnessName: AGENT_PROCESS_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: agentProcessEvidenceSummaryFromExecution(execution)
  };
}
