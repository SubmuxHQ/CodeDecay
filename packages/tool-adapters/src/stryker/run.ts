import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
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
import type { StrykerHarnessOptions } from "../types";
import {
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
import { validateStrykerPlan } from "./validation";

export async function runStrykerPlan(
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
