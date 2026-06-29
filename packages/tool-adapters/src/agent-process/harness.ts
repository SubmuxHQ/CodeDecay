import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import {
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type HarnessPlan,
  type HarnessPlanInput,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type {
  AgentProcessHarnessOptions,
  CodeDecayAgentProcessToolAdapter,
  ConfiguredToolHarness
} from "../types";
import { writeAgentProcessBundle } from "./bundle";
import {
  AGENT_PROCESS_BUNDLE_DIR,
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
import { validateAgentProcessOptions, validateAgentProcessPlan } from "./validation";

export function createAgentProcessHarness(options: AgentProcessHarnessOptions = {}): CodeDecayHarness {
  validateAgentProcessOptions(options);

  return {
    name: AGENT_PROCESS_HARNESS_NAME,
    capabilities: ["agent-reasoning", "execution"],
    requiredConfig: [
      {
        key: "agentProcess.command",
        description: "Command that runs a local user-owned agent or agent harness.",
        required: true
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createAgentProcessPlan(input, options),
    run: async (plan, context) => runAgentProcessPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: AGENT_PROCESS_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${AGENT_PROCESS_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredAgentProcessHarness(
  adapter: CodeDecayAgentProcessToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: AgentProcessHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.profile !== undefined) {
    options.profile = adapter.profile;
  }

  if (adapter.bundleFormat !== undefined) {
    options.bundleFormat = adapter.bundleFormat;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;
  const configured: ConfiguredToolHarness = {
    kind: "agent-process",
    name: "Agent Process",
    command: options.command ?? "<agent command required>",
    context: {
      agentProfile: profile,
      agentBundleFormat: bundleFormat
    },
    harness: createAgentProcessHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createAgentProcessPlan(input: HarnessPlanInput, options: AgentProcessHarnessOptions): HarnessPlan {
  const command = options.command ?? "<agent command required>";
  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;

  return {
    id: "agent-process-review",
    harnessName: AGENT_PROCESS_HARNESS_NAME,
    summary: "Run a configured local agent process against a CodeDecay task bundle and collect untrusted suggestions.",
    requiresApproval: !options.allowCommands,
    steps: [
      {
        id: "prepare-agent-bundle",
        title: "Prepare agent task bundle",
        description: `Write a ${bundleFormat} CodeDecay agent bundle for profile ${profile} under ${AGENT_PROCESS_BUNDLE_DIR}.`
      },
      {
        id: "run-agent-process",
        title: "Run local agent process",
        description: `Run \`${command}\` from ${input.cwd} with CODEDECAY_AGENT_BUNDLE_PATH set.`
      }
    ]
  };
}

async function runAgentProcessPlan(
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
