import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type {
  McpExecutionResult,
  McpExecutionSummary,
  McpExecutionToolAdapterResult
} from "./types";

export function createExecutionSummary(
  results: McpExecutionResult[],
  toolAdapters: McpExecutionToolAdapterResult[],
  durationMs: number
): McpExecutionSummary {
  const allResults = [...results, ...toolAdapters];
  const passed = countStatus(allResults, "passed");
  const failed = countStatus(allResults, "failed");
  const skipped = countStatus(allResults, "skipped");
  const timedOut = countStatus(allResults, "timed_out");
  const errors = countStatus(allResults, "error");

  return {
    status: executionStatus(allResults, { failed, timedOut, errors }),
    total: allResults.length,
    passed,
    failed,
    skipped,
    timedOut,
    errors,
    durationMs
  };
}

export function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

function executionStatus(
  results: Array<{ status: AdapterStatus }>,
  counts: Pick<McpExecutionSummary, "failed" | "timedOut" | "errors">
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

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function countStatus(results: Array<{ status: AdapterStatus }>, status: AdapterStatus): number {
  return results.filter((result) => result.status === status).length;
}
