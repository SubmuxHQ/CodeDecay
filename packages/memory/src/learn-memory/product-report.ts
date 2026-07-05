import type { CodeDecayMemory } from "../types";
import type { MemoryLearningContext } from "./proposals";
import { appendLearnedProductGeneratedChecks } from "./product-generated";
import { appendLearnedProductWorkflowFailure } from "./product-workflow";
import { asRecord } from "./records";

export function appendLearnedProductReport(
  memory: CodeDecayMemory,
  report: Record<string, unknown>,
  sourcePath = "product report",
  context?: MemoryLearningContext | undefined
): void {
  const targets = Array.isArray(report.targets) ? report.targets : [];

  for (const targetValue of targets) {
    const target = asRecord(targetValue);
    if (!target) {
      continue;
    }

    appendLearnedProductGeneratedChecks(memory, target, {
      generatedKey: "generatedTests",
      runKey: "generatedTestRun",
      area: "ui",
      runFlag: "--run-generated-tests",
      sourcePath,
      context
    });
    appendLearnedProductGeneratedChecks(memory, target, {
      generatedKey: "generatedApiTests",
      runKey: "generatedApiTestRun",
      area: "api",
      runFlag: "--run-generated-api-tests",
      sourcePath,
      context
    });
    appendLearnedProductWorkflowFailure(memory, target, sourcePath, context);
  }
}
