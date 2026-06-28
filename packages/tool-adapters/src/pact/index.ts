import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type Evidence,
  type HarnessPlan,
  type HarnessPlanInput,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import {
  compactExecutionMetadata,
  evidenceSeverityFromExecution,
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed, validateNonEmptyString } from "../shared/values";
import type { CodeDecayCommandToolAdapter, ConfiguredToolHarness, PactHarnessOptions } from "../types";

const PACT_HARNESS_NAME = "pact";
const DEFAULT_PACT_COMMAND = "pnpm run test:pact";
const DEFAULT_PACT_TIMEOUT_MS = 180_000;

export function createPactHarness(options: PactHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_PACT_COMMAND;
  validatePactOptions({ ...options, command });

  return {
    name: PACT_HARNESS_NAME,
    capabilities: ["contract-testing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "pact.command",
        description: "Command that runs Pact contract tests for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createPactPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runPactPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: PACT_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${PACT_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredPactHarness(
  adapter: CodeDecayCommandToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_PACT_COMMAND;
  const harnessOptions: { command: string; timeoutMs?: number | undefined; allowCommands: boolean } = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    harnessOptions.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "pact",
    name: "Pact",
    command,
    harness: createPactHarness(harnessOptions)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createPactPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "pact-contract-testing",
    harnessName: PACT_HARNESS_NAME,
    summary: "Run configured Pact contract tests and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-pact",
        title: "Run Pact contract tests",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runPactPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: PactHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validatePactPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_PACT_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: options.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const evidence = [pactEvidenceFromExecution(execution)];

  if (execution.status === "passed") {
    return {
      harnessName: PACT_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts: [],
      summary: "Pact contract tests passed."
    };
  }

  return createHarnessFailureResult({
    harnessName: PACT_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: pactFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
}

function pactEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
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

function pactEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
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

function pactFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Pact command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Pact command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return pactEvidenceSummaryFromExecution(execution);
}

function validatePactOptions(options: PactHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Pact command");

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Pact timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Pact outputLimit must be a positive integer.");
  }
}

function validatePactPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== PACT_HARNESS_NAME) {
    throw new Error(`Pact harness cannot run plan for ${plan.harnessName}.`);
  }
}
