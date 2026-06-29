import type { ExecutionStatus } from "@submuxhq/codedecay-execution";
import type { ProductStartResult, ProductTargetStatus } from "../../types";

export function formatProductStatus(status: ProductTargetStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatCommandExecutionStatus(status: ExecutionStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatProductStartStatus(status: ProductStartResult["status"]): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
