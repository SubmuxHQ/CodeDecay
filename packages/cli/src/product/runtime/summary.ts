import type { CommandExecutionResult, ExecutionStatus } from "@submuxhq/codedecay-execution";
import type { ProductTargetResult, ProductTargetStatus, ProductTargetSummary } from "../../types";

export function createProductTargetSummary(results: ProductTargetResult[], durationMs: number): ProductTargetSummary {
  const passed = countProductStatus(results, "passed");
  const failed = countProductStatus(results, "failed");
  const skipped = countProductStatus(results, "skipped");
  const blocked = countProductStatus(results, "blocked");
  const timedOut = countProductStatus(results, "timed_out");

  return {
    status: productTargetStatus(results, { failed, blocked, timedOut }),
    total: results.length,
    ready: results.filter((result) => result.readiness.status === "ready" || result.readiness.status === "command-required").length,
    passed,
    failed,
    skipped,
    blocked,
    timedOut,
    durationMs
  };
}

export function productStatusFromRequiredCommand(status: ExecutionStatus): ProductTargetStatus {
  if (status === "passed") {
    return "passed";
  }

  if (status === "timed_out") {
    return "timed_out";
  }

  if (status === "skipped" || status === "blocked") {
    return "blocked";
  }

  return "failed";
}

export function commandActuallyExecuted(result: CommandExecutionResult | undefined): boolean {
  return result !== undefined && result.status !== "skipped" && result.status !== "blocked";
}

export function isProductTargetFailure(status: ProductTargetStatus): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out";
}

function productTargetStatus(
  results: ProductTargetResult[],
  counts: Pick<ProductTargetSummary, "failed" | "blocked" | "timedOut">
): ProductTargetStatus {
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

function countProductStatus(results: ProductTargetResult[], status: ProductTargetStatus): number {
  return results.filter((result) => result.status === status).length;
}
