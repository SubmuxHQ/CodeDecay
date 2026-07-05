import type { CodeDecayMemory } from "../types";
import type { MemoryLearningContext } from "./proposals";
import { learningSource, recordMemoryProposal } from "./proposals";
import { asRecord, stringValue } from "./records";
import { safeLearnedText } from "./text";
import { productPathFromUnknown, targetIdFromProductReportTarget } from "./product-paths";

export function appendLearnedProductWorkflowFailure(
  memory: CodeDecayMemory,
  target: Record<string, unknown>,
  sourcePath = "product report",
  context?: MemoryLearningContext | undefined
): void {
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

  const regression = {
    title: `Product workflow: ${targetId}: ${status.replace("_", " ")}`,
    description: safeLearnedText(reason),
    check: `npx codedecay product --target ${targetId} --format markdown`,
    severity: status === "failed" ? "high" : "medium",
    ...(productPath ? { productPaths: [productPath] } : {})
  } as const;
  memory.regressions.push(regression);
  recordMemoryProposal({
    context,
    section: "regressions",
    title: regression.title,
    entry: regression,
    source: learningSource("product-report", sourcePath, target, regression.title),
    confidence: regression.severity,
    why: `Product report shows target ${targetId} ended with ${status}; future changes should recheck that workflow.`
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
