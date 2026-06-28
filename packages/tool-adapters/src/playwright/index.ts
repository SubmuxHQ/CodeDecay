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
import type { CodeDecayCommandToolAdapter, ConfiguredToolHarness, PlaywrightHarnessOptions } from "../types";

const PLAYWRIGHT_HARNESS_NAME = "playwright";
const DEFAULT_PLAYWRIGHT_COMMAND = "pnpm exec playwright test";
const DEFAULT_PLAYWRIGHT_TIMEOUT_MS = 120_000;

export function createPlaywrightHarness(options: PlaywrightHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_PLAYWRIGHT_COMMAND;
  validatePlaywrightOptions({ ...options, command });

  return {
    name: PLAYWRIGHT_HARNESS_NAME,
    capabilities: ["browser-flow", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "playwright.command",
        description: "Command that runs Playwright checks for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createPlaywrightPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runPlaywrightPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: PLAYWRIGHT_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${PLAYWRIGHT_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredPlaywrightHarness(
  adapter: CodeDecayCommandToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_PLAYWRIGHT_COMMAND;
  const harnessOptions: { command: string; timeoutMs?: number | undefined; allowCommands: boolean } = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    harnessOptions.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "playwright",
    name: "Playwright",
    command,
    harness: createPlaywrightHarness(harnessOptions)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createPlaywrightPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "playwright-browser-flow",
    harnessName: PLAYWRIGHT_HARNESS_NAME,
    summary: "Run configured Playwright browser/user-flow checks and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-playwright",
        title: "Run Playwright checks",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runPlaywrightPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: PlaywrightHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validatePlaywrightPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_PLAYWRIGHT_TIMEOUT_MS;
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
  const evidence = [playwrightEvidenceFromExecution(execution)];

  if (execution.status === "passed") {
    return {
      harnessName: PLAYWRIGHT_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts: [],
      summary: "Playwright checks passed."
    };
  }

  return createHarnessFailureResult({
    harnessName: PLAYWRIGHT_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: playwrightFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
}

function playwrightEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Playwright",
      id: "playwright"
    },
    kind: "browser-flow",
    severity: evidenceSeverityFromExecution(execution),
    summary: playwrightEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function playwrightEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Playwright checks passed.";
  }

  if (execution.status === "skipped") {
    return "Playwright checks were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Playwright command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Playwright command timed out.";
  }

  if (execution.status === "error") {
    return `Playwright command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Playwright command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function playwrightFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Playwright command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Playwright command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return playwrightEvidenceSummaryFromExecution(execution);
}

function validatePlaywrightOptions(options: PlaywrightHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Playwright command");

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Playwright timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Playwright outputLimit must be a positive integer.");
  }
}

function validatePlaywrightPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== PLAYWRIGHT_HARNESS_NAME) {
    throw new Error(`Playwright harness cannot run plan for ${plan.harnessName}.`);
  }
}
