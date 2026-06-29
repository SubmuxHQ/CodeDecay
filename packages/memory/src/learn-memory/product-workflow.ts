import type { CodeDecayMemory } from "../types";
import { asRecord, stringValue } from "./records";
import { safeLearnedText } from "./text";
import { productPathFromUnknown, targetIdFromProductReportTarget } from "./product-paths";

export function appendLearnedProductWorkflowFailure(memory: CodeDecayMemory, target: Record<string, unknown>): void {
  const status = stringValue(target.status);
  if (!status || !["failed", "blocked", "timed_out"].includes(status)) {
    return;
  }

  const hasGeneratedFailures = ["generatedTestRun", "generatedApiTestRun"].some((key) => {
    const run = asRecord(target[key]);
    return Array.isArray(run?.failures) && run.failures.length > 0;
  });
  if (hasGeneratedFailures) {
    return;
  }

  const targetId = targetIdFromProductReportTarget(target);
  const reason = productWorkflowFailureReason(target) ?? `Product target ended with status ${status}.`;
  const productPath = productPathFromUnknown(target.healthCheck) ?? productPathFromUnknown(target.baseUrl);

  memory.regressions.push({
    title: `Product workflow: ${targetId}: ${status.replace("_", " ")}`,
    description: safeLearnedText(reason),
    check: `npx codedecay product --target ${targetId} --format markdown`,
    severity: status === "failed" ? "high" : "medium",
    ...(productPath ? { productPaths: [productPath] } : {})
  });
}

function productWorkflowFailureReason(target: Record<string, unknown>): string | undefined {
  for (const key of ["setup", "start", "health", "exploration", "generatedTests", "generatedApiTests", "teardown"]) {
    const value = asRecord(target[key]);
    const reason = stringValue(value?.error) ?? stringValue(value?.stderr) ?? stringValue(value?.blockedReason);
    if (reason) {
      return reason;
    }
  }

  return undefined;
}
