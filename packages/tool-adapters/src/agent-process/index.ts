import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type Evidence,
  type EvidenceSeverity,
  type HarnessPlan,
  type HarnessPlanInput,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import {
  compactExecutionMetadata,
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed, optionalStringValue, validateNonEmptyString } from "../shared/values";
import type {
  AgentProcessHarnessOptions,
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProcessToolAdapter,
  CodeDecayAgentProfile,
  ConfiguredToolHarness
} from "../types";

const AGENT_PROCESS_HARNESS_NAME = "agent-process";
const DEFAULT_AGENT_PROCESS_TIMEOUT_MS = 300_000;
const DEFAULT_AGENT_PROCESS_PROFILE: CodeDecayAgentProfile = "generic";
const DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT: CodeDecayAgentBundleFormat = "markdown";
const AGENT_PROCESS_BUNDLE_DIR = ".codedecay/local/agent-process";

interface AgentProcessBundle {
  artifactPath: string;
  absolutePath: string;
  bundleFormat: CodeDecayAgentBundleFormat;
}

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
    const evidence = [
      createEvidence({
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
      })
    ];

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

function writeAgentProcessBundle(
  cwd: string,
  context: Record<string, unknown> | undefined,
  profile: CodeDecayAgentProfile,
  format: CodeDecayAgentBundleFormat
): AgentProcessBundle {
  const contextBundle = optionalStringValue(context?.agentBundle);
  const rawContextFormat = context?.agentBundleFormat;
  const contextFormat = isAgentBundleFormat(rawContextFormat) ? rawContextFormat : format;
  const bundleFormat = contextFormat ?? format;
  const artifactPath = join(AGENT_PROCESS_BUNDLE_DIR, bundleFormat === "json" ? "bundle.json" : "bundle.md");
  const absolutePath = join(cwd, artifactPath);
  const contents = contextBundle ?? fallbackAgentProcessBundle(profile, bundleFormat);

  mkdirSync(join(cwd, AGENT_PROCESS_BUNDLE_DIR), { recursive: true });
  writeFileSync(absolutePath, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");

  return {
    artifactPath,
    absolutePath,
    bundleFormat
  };
}

function fallbackAgentProcessBundle(profile: CodeDecayAgentProfile, format: CodeDecayAgentBundleFormat): string {
  if (format === "json") {
    return JSON.stringify(
      {
        tool: "CodeDecay",
        mode: "agent-task-bundle",
        agentProfile: { id: profile },
        notes: [
          "No CodeDecay analysis bundle was provided by the caller.",
          "Treat this file as local context only; agent output is untrusted until verified."
        ]
      },
      null,
      2
    );
  }

  return [
    "## CodeDecay Agent Task Bundle",
    "",
    `Profile: ${profile}`,
    "",
    "No CodeDecay analysis bundle was provided by the caller.",
    "Treat this file as local context only; agent output is untrusted until verified."
  ].join("\n");
}

function agentProcessEvidenceFromExecution(
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

function agentProcessEvidenceSeverity(execution: CommandExecutionResult): EvidenceSeverity {
  if (execution.status === "passed") {
    return execution.stdout.trim() || execution.stderr.trim() ? "low" : "info";
  }

  if (execution.status === "skipped") {
    return "info";
  }

  return "high";
}

function agentProcessEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
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

function agentProcessFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Agent process command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Agent process command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return agentProcessEvidenceSummaryFromExecution(execution);
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

function isAgentBundleFormat(value: unknown): value is CodeDecayAgentBundleFormat {
  return value === "markdown" || value === "json";
}

function validateAgentProcessOptions(options: AgentProcessHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Agent process command");
  }

  if (options.profile !== undefined && !isCodeDecayAgentProfile(options.profile)) {
    throw new Error("Agent process profile must be generic, codex, claude-code, cursor, pi, opencode, or desktop.");
  }

  if (options.bundleFormat !== undefined && !isAgentBundleFormat(options.bundleFormat)) {
    throw new Error("Agent process bundleFormat must be markdown or json.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Agent process timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Agent process outputLimit must be a positive integer.");
  }
}

function isCodeDecayAgentProfile(value: string): value is CodeDecayAgentProfile {
  return (
    value === "generic" ||
    value === "codex" ||
    value === "claude-code" ||
    value === "cursor" ||
    value === "pi" ||
    value === "opencode" ||
    value === "desktop"
  );
}

function validateAgentProcessPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== AGENT_PROCESS_HARNESS_NAME) {
    throw new Error(`Agent process harness cannot run plan for ${plan.harnessName}.`);
  }
}
