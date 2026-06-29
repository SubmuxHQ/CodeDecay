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
  DEFAULT_PACT_COMMAND,
  DEFAULT_PACT_TIMEOUT_MS,
  PACT_HARNESS_NAME
} from "./constants";
import {
  pactEvidenceFromExecution,
  pactFailureMessageFromExecution
} from "./evidence";
import {
  validatePactOptions,
  validatePactPlan
} from "./validation";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { PactHarnessOptions } from "../types";

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
