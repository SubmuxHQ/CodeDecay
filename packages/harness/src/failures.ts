import { sortEvidence } from "./evidence";
import type {
  Evidence,
  HarnessFailureMode,
  HarnessRunResult,
  HarnessRunStatus,
  HarnessSummary
} from "./types";

export function createHarnessFailureResult(input: {
  harnessName: string;
  mode: HarnessFailureMode;
  message: string;
  status?: HarnessRunStatus | undefined;
  durationMs?: number | undefined;
  evidence?: Evidence[] | undefined;
}): HarnessRunResult {
  validateNonEmptyString(input.harnessName, "Harness name");
  validateNonEmptyString(input.message, "Harness failure message");

  const evidence = input.evidence ? sortEvidence(input.evidence) : [];

  return {
    harnessName: input.harnessName,
    status: input.status ?? statusForFailureMode(input.mode),
    durationMs: input.durationMs ?? 0,
    evidence,
    artifacts: [],
    summary: input.message,
    failure: {
      mode: input.mode,
      message: input.message,
      evidence
    }
  };
}

export function summarizeHarnessResult(result: HarnessRunResult): HarnessSummary {
  return {
    harnessName: result.harnessName,
    status: result.status,
    summary: result.summary ?? result.failure?.message ?? `${result.harnessName} produced ${result.evidence.length} evidence item(s).`,
    evidenceCount: result.evidence.length,
    failure: result.failure
  };
}

function statusForFailureMode(mode: HarnessFailureMode): HarnessRunStatus {
  if (mode === "timeout") {
    return "timed_out";
  }

  if (mode === "missing-tool" || mode === "missing-config" || mode === "command-denied" || mode === "network-required") {
    return "skipped";
  }

  if (mode === "nonzero-exit" || mode === "unsafe-command" || mode === "no-evidence") {
    return "failed";
  }

  return "error";
}

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}
