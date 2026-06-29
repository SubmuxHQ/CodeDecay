import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type HarnessPlan,
  type HarnessPlanInput,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import { resolveSemgrepDisplayCommand, resolveSemgrepRunCommand } from "./commands";
import {
  DEFAULT_SEMGREP_FAIL_ON_SEVERITY,
  DEFAULT_SEMGREP_TIMEOUT_MS,
  LOCAL_SEMGREP_CONFIG_CANDIDATES,
  SEMGREP_HARNESS_NAME
} from "./constants";
import {
  semgrepEvidenceFromExecution,
  semgrepEvidenceFromReport,
  semgrepFailureMessageFromExecution
} from "./evidence";
import { analyzeSemgrepReport, findingsAtOrAboveThreshold } from "./report";
import { validateSemgrepOptions, validateSemgrepPlan } from "./validation";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { CodeDecaySemgrepToolAdapter, ConfiguredToolHarness, SemgrepHarnessOptions } from "../types";

export function createSemgrepHarness(options: SemgrepHarnessOptions = {}): CodeDecayHarness {
  validateSemgrepOptions(options);

  return {
    name: SEMGREP_HARNESS_NAME,
    capabilities: ["static-analysis", "execution"],
    requiredConfig: [
      {
        key: "semgrep.command",
        description: "Optional explicit command that runs Semgrep. Required for registry or remote configs.",
        required: false
      },
      {
        key: "semgrep.config",
        description: "Local Semgrep config path used when no explicit command is provided.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createSemgrepPlan(input, resolveSemgrepDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runSemgrepPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: SEMGREP_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${SEMGREP_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredSemgrepHarness(
  adapter: CodeDecaySemgrepToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SemgrepHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.config !== undefined) {
    options.config = adapter.config;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  if (adapter.failOnSeverity !== undefined) {
    options.failOnSeverity = adapter.failOnSeverity;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "semgrep",
    name: "Semgrep",
    command: resolveSemgrepDisplayCommand(options),
    harness: createSemgrepHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createSemgrepPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "semgrep-static-analysis",
    harnessName: SEMGREP_HARNESS_NAME,
    summary: "Run configured Semgrep static analysis and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-semgrep",
        title: "Run Semgrep static analysis",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runSemgrepPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: SemgrepHarnessOptions
): Promise<HarnessRunResult> {
  validateSemgrepPlan(plan);
  const startedAt = Date.now();
  const resolved = resolveSemgrepRunCommand(context.cwd, options);
  const failOnSeverity = options.failOnSeverity ?? DEFAULT_SEMGREP_FAIL_ON_SEVERITY;

  if (!resolved.command) {
    const durationMs = elapsed(startedAt);
    const evidence = [
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: "info",
        summary: "Semgrep was skipped because no local Semgrep config was configured or discovered.",
        trusted: true,
        command: resolved.displayCommand,
        metadata: {
          status: "skipped",
          searchedConfigs: LOCAL_SEMGREP_CONFIG_CANDIDATES
        }
      })
    ];

    return createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "missing-config",
      message: "Semgrep requires a local config path or explicit command before CodeDecay can run it.",
      status: "skipped",
      durationMs,
      evidence
    });
  }

  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_SEMGREP_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: resolved.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const canParseSemgrepReport = execution.status === "passed" || execution.status === "failed";
  const analysis = canParseSemgrepReport
    ? analyzeSemgrepReport(context.cwd, options.reportPath, execution.stdout)
    : undefined;
  const artifacts = analysis?.artifactPath
    ? [
        {
          path: analysis.artifactPath,
          description: "Semgrep JSON report."
        }
      ]
    : [];
  const evidence = [
    semgrepEvidenceFromExecution(execution),
    ...semgrepEvidenceFromReport(analysis, execution.command, failOnSeverity)
  ];

  if (execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: semgrepFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (analysis?.parseError) {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "internal-error",
      message: analysis.parseError,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  const thresholdFindings = analysis ? findingsAtOrAboveThreshold(analysis.findings, failOnSeverity) : [];
  if (thresholdFindings.length > 0) {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "tool-finding",
      message: `Semgrep found ${thresholdFindings.length} finding(s) at or above ${failOnSeverity} severity.`,
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
    harnessName: SEMGREP_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: "Semgrep static analysis passed."
  };
}
