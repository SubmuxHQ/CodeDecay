import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type { Evidence } from "@submuxhq/codedecay-harness";

export function formatExecutionStatus(status: AdapterStatus | "not_confirmed"): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  if (status === "not_confirmed") {
    return "Not confirmed";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatEvidenceSeverity(severity: Evidence["severity"]): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}
