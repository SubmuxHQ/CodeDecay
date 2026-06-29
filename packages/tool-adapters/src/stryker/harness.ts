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
  DEFAULT_STRYKER_COMMAND,
  DEFAULT_STRYKER_REPORT_PATH,
  DEFAULT_STRYKER_TIMEOUT_MS,
  STRYKER_HARNESS_NAME
} from "./constants";
import {
  strykerEvidenceFromExecution,
  strykerEvidenceFromReport,
  strykerFailureMessageFromExecution
} from "./evidence";
import {
  analyzeStrykerMutationReport,
  strykerReportFailureMessage
} from "./report";
import { validateStrykerOptions, validateStrykerPlan } from "./validation";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { CodeDecayStrykerToolAdapter, ConfiguredToolHarness, StrykerHarnessOptions } from "../types";

export function createStrykerHarness(options: StrykerHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_STRYKER_COMMAND;
  validateStrykerOptions({ ...options, command });

  return {
    name: STRYKER_HARNESS_NAME,
    capabilities: ["mutation-testing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "stryker.command",
        description: "Command that runs StrykerJS mutation tests for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createStrykerPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runStrykerPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: STRYKER_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${STRYKER_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredStrykerHarness(
  adapter: CodeDecayStrykerToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_STRYKER_COMMAND;
  const options: StrykerHarnessOptions = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  const configured: ConfiguredToolHarness = {
    kind: "stryker",
    name: "StrykerJS",
    command,
    harness: createStrykerHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createStrykerPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "stryker-mutation-testing",
    harnessName: STRYKER_HARNESS_NAME,
    summary: "Run configured StrykerJS mutation tests and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-stryker",
        title: "Run StrykerJS mutation tests",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runStrykerPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: StrykerHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validateStrykerPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_STRYKER_TIMEOUT_MS;
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
  const mutationReport = analyzeStrykerMutationReport(context.cwd, options.reportPath ?? DEFAULT_STRYKER_REPORT_PATH);
  const evidence = [
    strykerEvidenceFromExecution(execution),
    ...strykerEvidenceFromReport(mutationReport, options.command)
  ];
  const artifacts = mutationReport?.reportPath
    ? [
        {
          path: mutationReport.reportPath,
          description: "StrykerJS mutation testing report."
        }
      ]
    : [];

  if (execution.status === "passed") {
    if (mutationReport?.parseError || (mutationReport && mutationReport.weakMutants.length > 0)) {
      const failed = createHarnessFailureResult({
        harnessName: STRYKER_HARNESS_NAME,
        mode: mutationReport.parseError ? "internal-error" : "no-evidence",
        message: mutationReport.parseError ?? strykerReportFailureMessage(mutationReport),
        status: "failed",
        durationMs,
        evidence
      });
      return {
        ...failed,
        artifacts
      };
    }

    return {
      harnessName: STRYKER_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts,
      summary: "StrykerJS mutation checks passed."
    };
  }

  const failed = createHarnessFailureResult({
    harnessName: STRYKER_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: strykerFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
  return {
    ...failed,
    artifacts
  };
}
