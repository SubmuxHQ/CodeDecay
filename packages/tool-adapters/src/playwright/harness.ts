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
  DEFAULT_PLAYWRIGHT_COMMAND,
  DEFAULT_PLAYWRIGHT_TIMEOUT_MS,
  PLAYWRIGHT_HARNESS_NAME
} from "./constants";
import {
  playwrightEvidenceFromExecution,
  playwrightFailureMessageFromExecution
} from "./evidence";
import {
  validatePlaywrightOptions,
  validatePlaywrightPlan
} from "./validation";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { PlaywrightHarnessOptions } from "../types";

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
