import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
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
  CodeDecayCoverageToolAdapter,
  ConfiguredToolHarness,
  CoverageHarnessOptions
} from "../types";
import { analyzeCoverageReports } from "./analysis";
import {
  COVERAGE_HARNESS_NAME,
  DEFAULT_COVERAGE_FAIL_ON,
  DEFAULT_COVERAGE_TIMEOUT_MS
} from "./constants";
import {
  coverageCollectionEvidence,
  coverageEvidenceFromExecution,
  coverageEvidenceFromReport,
  coverageFailureMessageFromExecution
} from "./evidence";
import { validateCoverageOptions, validateCoveragePlan } from "./validation";

export function createCoverageHarness(options: CoverageHarnessOptions = {}): CodeDecayHarness {
  validateCoverageOptions(options);

  return {
    name: COVERAGE_HARNESS_NAME,
    capabilities: ["coverage", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "coverage.command",
        description: "Optional command that runs the repo's own coverage-producing tests.",
        required: false
      },
      {
        key: "coverage.reportPaths",
        description: "Optional local Istanbul, LCOV, or V8 coverage artifact paths.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createCoveragePlan(input, resolveCoverageDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runCoveragePlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: COVERAGE_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${COVERAGE_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredCoverageHarness(
  adapter: CodeDecayCoverageToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: CoverageHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.reportPaths !== undefined) {
    options.reportPaths = adapter.reportPaths;
  }

  if (adapter.failOn !== undefined) {
    options.failOn = adapter.failOn;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "coverage",
    name: "Coverage",
    command: resolveCoverageDisplayCommand(options),
    harness: createCoverageHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

export function resolveCoverageDisplayCommand(options: Pick<CoverageHarnessOptions, "command">): string {
  return options.command ?? "collect coverage artifacts";
}

function createCoveragePlan(input: HarnessPlanInput, command: string, allowCommands: boolean): HarnessPlan {
  return {
    id: "coverage-evidence",
    harnessName: COVERAGE_HARNESS_NAME,
    summary: "Run or collect configured coverage evidence from local artifacts.",
    requiresApproval: command !== "collect coverage artifacts" && !allowCommands,
    steps: [
      {
        id: "run-or-collect-coverage",
        title: "Run or collect coverage evidence",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runCoveragePlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: CoverageHarnessOptions
): Promise<HarnessRunResult> {
  validateCoveragePlan(plan);
  const startedAt = Date.now();
  const failOn = options.failOn ?? DEFAULT_COVERAGE_FAIL_ON;
  let execution: CommandExecutionResult | undefined;

  if (options.command) {
    const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS;
    execution = await runConfiguredCommand({
      command: options.command,
      cwd: context.cwd,
      timeoutMs,
      outputLimit: options.outputLimit,
      safety: {
        allowCommands: options.allowCommands ?? false,
        allowUnsafeCommands: options.allowUnsafeCommands
      }
    });
  }

  const durationMs = elapsed(startedAt);
  const canParseCoverage = !execution || execution.status === "passed" || execution.status === "failed";
  const analysis = canParseCoverage ? analyzeCoverageReports(context.cwd, options.reportPaths) : undefined;
  const artifacts = analysis?.sources.map((source) => ({
    path: source.path,
    description: `${source.kind.toUpperCase()} coverage report.`
  })) ?? [];
  const command = options.command ?? "collect coverage artifacts";
  const evidence = [
    ...(execution ? [coverageEvidenceFromExecution(execution)] : [coverageCollectionEvidence(command)]),
    ...coverageEvidenceFromReport(analysis, command, failOn)
  ];

  if (execution && execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: coverageFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (!analysis) {
    const message = options.command
      ? "Coverage command completed, but no supported coverage artifact was found."
      : "No supported coverage artifact was configured or discovered.";
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: options.command ? "no-evidence" : "missing-config",
      message,
      status: options.command ? "failed" : "skipped",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (analysis.parseErrors.length > 0) {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: "internal-error",
      message: `Could not parse ${analysis.parseErrors.length} coverage artifact(s).`,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (failOn === "uncovered" && analysis.totals.uncoveredLines > 0) {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: "tool-finding",
      message: `Coverage artifacts contain ${analysis.totals.uncoveredLines} uncovered measured line(s).`,
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
    harnessName: COVERAGE_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: "Coverage evidence collected."
  };
}
