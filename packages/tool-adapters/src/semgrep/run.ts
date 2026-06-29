import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
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
import type { SemgrepHarnessOptions } from "../types";
import { resolveSemgrepRunCommand } from "./commands";
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
import { validateSemgrepPlan } from "./validation";

export async function runSemgrepPlan(
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
