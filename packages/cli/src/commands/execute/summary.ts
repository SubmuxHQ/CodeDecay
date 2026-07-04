import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type { ExecutionResult, ExecutionSummary, ExecutionToolAdapterResult } from "../../types";

export function createExecutionSummary(
  results: ExecutionResult[],
  toolAdapters: ExecutionToolAdapterResult[],
  durationMs: number
): ExecutionSummary {
  const allResults = [...results, ...toolAdapters];
  const passed = countStatus(allResults, "passed");
  const failed = countStatus(allResults, "failed");
  const skipped = countStatus(allResults, "skipped");
  const blocked = countStatus(allResults, "blocked");
  const timedOut = countStatus(allResults, "timed_out");
  const errors = countStatus(allResults, "error");

  return {
    status: executionStatus(allResults, { failed, blocked, timedOut, errors }),
    total: allResults.length,
    passed,
    failed,
    skipped,
    blocked,
    timedOut,
    errors,
    durationMs
  };
}

export function isExecutionFailure(status: AdapterStatus): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out" || status === "error";
}

function executionStatus(
  results: Array<{ status: AdapterStatus }>,
  counts: Pick<ExecutionSummary, "failed" | "blocked" | "timedOut" | "errors">
): AdapterStatus {
  if (counts.errors > 0) {
    return "error";
  }

  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.blocked > 0) {
    return "blocked";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function countStatus(results: Array<{ status: AdapterStatus }>, status: AdapterStatus): number {
  return results.filter((result) => result.status === status).length;
}
