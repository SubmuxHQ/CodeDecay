import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createHarnessFailureResult,
  type HarnessPlan,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import {
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { elapsed } from "../shared/values";
import type { CoverageHarnessOptions } from "../types";
import { analyzeCoverageReports } from "./analysis";
import {
  coverageCollectionEvidence,
  coverageEvidenceFromExecution,
  coverageEvidenceFromReport,
  coverageFailureMessageFromExecution
} from "./evidence";
import {
  COVERAGE_HARNESS_NAME,
  DEFAULT_COVERAGE_FAIL_ON,
  DEFAULT_COVERAGE_TIMEOUT_MS
} from "./constants";
import { validateCoveragePlan } from "./validation";

export async function runCoveragePlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: CoverageHarnessOptions
): Promise<HarnessRunResult> {
  validateCoveragePlan(plan);
  const startedAt = Date.now();
  const failOn = options.failOn ?? DEFAULT_COVERAGE_FAIL_ON;
  const execution = await runCoverageCommand(context, options);
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

async function runCoverageCommand(
  context: HarnessRunContext,
  options: CoverageHarnessOptions
): Promise<CommandExecutionResult | undefined> {
  if (!options.command) {
    return undefined;
  }

  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS;
  return await runConfiguredCommand({
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
