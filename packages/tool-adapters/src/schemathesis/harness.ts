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
import { resolveSchemathesisCommand } from "./commands";
import {
  DEFAULT_SCHEMATHESIS_TIMEOUT_MS,
  SCHEMATHESIS_HARNESS_NAME
} from "./constants";
import {
  schemathesisEvidenceFromExecution,
  schemathesisFailureMessageFromExecution
} from "./evidence";
import {
  validateSchemathesisOptions,
  validateSchemathesisPlan
} from "./validation";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { SchemathesisHarnessOptions } from "../types";

export function createSchemathesisHarness(options: SchemathesisHarnessOptions = {}): CodeDecayHarness {
  const command = resolveSchemathesisCommand(options);
  validateSchemathesisOptions({ ...options, command });

  return {
    name: SCHEMATHESIS_HARNESS_NAME,
    capabilities: ["api-fuzzing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "schemathesis.command",
        description: "Command that runs Schemathesis API fuzzing for the repo.",
        required: false
      },
      {
        key: "schemathesis.schema",
        description: "OpenAPI or GraphQL schema path or URL used when no explicit command is provided.",
        required: false
      },
      {
        key: "schemathesis.baseUrl",
        description: "Base URL for file-based schemas when no explicit command is provided.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createSchemathesisPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runSchemathesisPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: SCHEMATHESIS_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${SCHEMATHESIS_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

function createSchemathesisPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "schemathesis-api-fuzzing",
    harnessName: SCHEMATHESIS_HARNESS_NAME,
    summary: "Run configured Schemathesis API fuzzing and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-schemathesis",
        title: "Run Schemathesis API fuzzing",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runSchemathesisPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: SchemathesisHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validateSchemathesisPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_SCHEMATHESIS_TIMEOUT_MS;
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
  const evidence = [schemathesisEvidenceFromExecution(execution)];

  if (execution.status === "passed") {
    return {
      harnessName: SCHEMATHESIS_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts: [],
      summary: "Schemathesis API fuzzing passed."
    };
  }

  return createHarnessFailureResult({
    harnessName: SCHEMATHESIS_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: schemathesisFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
}
