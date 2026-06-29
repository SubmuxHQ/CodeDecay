import type { ProductFailureBundle } from "../types";
import { classifyProductWorkflowFailure } from "./classification";
import { productFailureSuggestedFixTasks } from "./suggestions";
import { asRecord, slugId, stringValue } from "./utils";

export function productFailureBundleFromTargetStatus(target: Record<string, unknown>): ProductFailureBundle | undefined {
  const status = stringValue(target.status);
  if (!status || !["failed", "blocked", "timed_out"].includes(status)) {
    return undefined;
  }

  const targetId = stringValue(target.id) ?? "product";
  const targetBaseUrl = stringValue(target.baseUrl);
  const reason = productTargetFailureReason(target) ?? `Product target ended with status ${status}.`;
  const classification = classifyProductWorkflowFailure(target, status, reason);

  return {
    schemaVersion: 1,
    id: slugId(`${targetId}-workflow-${status}`),
    checkId: `${targetId}.workflow.${status}`,
    checkKind: "workflow",
    priority: status === "failed" ? "high" : "medium",
    target: targetBaseUrl ? { id: targetId, baseUrl: targetBaseUrl } : { id: targetId },
    title: `Product target ${targetId} ${status.replace("_", " ")}`,
    summary: reason,
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    classificationEvidence: classification.evidence,
    failedStep: {
      index: 1,
      label: "Run product target workflow.",
      status: "failed",
      expected: "Product target workflow completes without failures.",
      actual: reason
    },
    neighboringSteps: [],
    artifacts: [],
    expected: "Product target workflow completes without failures.",
    actual: reason,
    impactedFiles: [],
    suggestedFixTasks: productFailureSuggestedFixTasks(classification.classification, "workflow"),
    rerunCommand: `npx codedecay product --target ${targetId} --format markdown`
  };
}

function productTargetFailureReason(target: Record<string, unknown>): string | undefined {
  for (const key of ["setup", "start", "health", "exploration", "generatedTests", "generatedApiTests", "teardown"]) {
    const value = asRecord(target[key]);
    const error = stringValue(value?.error) ?? stringValue(value?.stderr) ?? stringValue(value?.blockedReason);
    if (error) {
      return error;
    }
  }

  return undefined;
}
