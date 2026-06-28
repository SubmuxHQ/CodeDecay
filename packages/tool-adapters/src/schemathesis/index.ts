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
import type {
  CodeDecaySchemathesisToolAdapter,
  ConfiguredToolHarness,
  SchemathesisHarnessOptions
} from "../types";

const SCHEMATHESIS_HARNESS_NAME = "schemathesis";
const DEFAULT_SCHEMATHESIS_SCHEMA = "openapi.yaml";
const DEFAULT_SCHEMATHESIS_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_SCHEMATHESIS_TIMEOUT_MS = 300_000;

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

export function createConfiguredSchemathesisHarness(
  adapter: CodeDecaySchemathesisToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SchemathesisHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.schema !== undefined) {
    options.schema = adapter.schema;
  }

  if (adapter.baseUrl !== undefined) {
    options.baseUrl = adapter.baseUrl;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const command = resolveSchemathesisCommand(options);
  const configured: ConfiguredToolHarness = {
    kind: "schemathesis",
    name: "Schemathesis",
    command,
    harness: createSchemathesisHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
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

function schemathesisEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Schemathesis",
      id: "schemathesis"
    },
    kind: "api-fuzz",
    severity: evidenceSeverityFromExecution(execution),
    summary: schemathesisEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function schemathesisEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Schemathesis API fuzzing passed.";
  }

  if (execution.status === "skipped") {
    return "Schemathesis API fuzzing was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Schemathesis command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Schemathesis command timed out.";
  }

  if (execution.status === "error") {
    return `Schemathesis command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Schemathesis command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function schemathesisFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Schemathesis command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Schemathesis command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return schemathesisEvidenceSummaryFromExecution(execution);
}

function validateSchemathesisOptions(options: SchemathesisHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Schemathesis command");

  if (options.schema !== undefined) {
    validateNonEmptyString(options.schema, "Schemathesis schema");
  }

  if (options.baseUrl !== undefined) {
    validateNonEmptyString(options.baseUrl, "Schemathesis baseUrl");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Schemathesis timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Schemathesis outputLimit must be a positive integer.");
  }
}

function validateSchemathesisPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== SCHEMATHESIS_HARNESS_NAME) {
    throw new Error(`Schemathesis harness cannot run plan for ${plan.harnessName}.`);
  }
}

function resolveSchemathesisCommand(options: SchemathesisHarnessOptions): string {
  if (options.command !== undefined) {
    return options.command;
  }

  const schema = options.schema ?? DEFAULT_SCHEMATHESIS_SCHEMA;
  const baseUrl = options.baseUrl ?? DEFAULT_SCHEMATHESIS_BASE_URL;
  return `st run ${quoteShellArg(schema)} --url ${quoteShellArg(baseUrl)}`;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}
