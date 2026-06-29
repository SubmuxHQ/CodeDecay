import { dedupeStrings } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "../types";
import { asRecord, stringArray, stringValue } from "./records";
import { safeLearnedText } from "./text";
import {
  productPathsFromFailure,
  productPathsFromTest,
  productRerunCommand,
  targetIdFromProductReportTarget
} from "./product-paths";

export interface ProductGeneratedCheckInput {
  generatedKey: "generatedTests" | "generatedApiTests";
  runKey: "generatedTestRun" | "generatedApiTestRun";
  area: "ui" | "api";
  runFlag: "--run-generated-tests" | "--run-generated-api-tests";
}

export function appendLearnedProductGeneratedChecks(
  memory: CodeDecayMemory,
  target: Record<string, unknown>,
  input: ProductGeneratedCheckInput
): void {
  const generated = asRecord(target[input.generatedKey]);
  const run = asRecord(target[input.runKey]);
  const tests = Array.isArray(generated?.tests) ? generated.tests : [];
  const failures = Array.isArray(run?.failures) ? run.failures : [];
  const targetId = targetIdFromProductReportTarget(target);
  if (stringValue(run?.status) === "passed") {
    for (const testValue of tests) {
      const test = asRecord(testValue);
      if (!test) {
        continue;
      }

      if (test.destructive === true) {
        continue;
      }

      const id = stringValue(test.id);
      const title = safeLearnedText(stringValue(test.title) ?? id ?? "Generated product check");
      const productPaths = productPathsFromTest(test);
      const rerunCommand = productRerunCommand(targetId, input.runFlag, id);

      memory.flows.push({
        name: `Product check: ${targetId}: ${title}`,
        description: `Passed generated ${input.area.toUpperCase()} product check for target ${targetId}.`,
        checks: [rerunCommand],
        areas: [input.area],
        ...(productPaths.length > 0 ? { productPaths } : {})
      });
    }
  }

  for (const failureValue of failures) {
    const failure = asRecord(failureValue);
    if (!failure) {
      continue;
    }

    const failureId = stringValue(failure.testId);
    const failureTitle = stringValue(failure.title);
    const matchingTest = tests
      .map((test) => asRecord(test))
      .find((test) => {
        if (!test) {
          return false;
        }

        return Boolean(
          (failureId && stringValue(test.id) === failureId) ||
            (failureTitle && stringValue(test.title) === failureTitle) ||
            (failureTitle && stringValue(test.title) && failureTitle.includes(stringValue(test.title) ?? ""))
        );
      });
    const title = safeLearnedText(failureTitle ?? stringValue(matchingTest?.title) ?? failureId ?? "Generated product check failed");
    const descriptionSource =
      stringValue(failure.error) ??
      stringValue(failure.actual) ??
      stringValue(failure.failingStep) ??
      `Generated ${input.area.toUpperCase()} product check failed for target ${targetId}.`;
    const productPaths = dedupeStrings([
      ...productPathsFromTest(matchingTest),
      ...productPathsFromFailure(failure)
    ]);
    const files = stringArray(failure.impactedFiles);

    memory.regressions.push({
      title: `Product regression: ${targetId}: ${title}`,
      description: safeLearnedText(`Generated ${input.area.toUpperCase()} product check failed for target ${targetId}. ${descriptionSource}`),
      check: safeLearnedText(stringValue(failure.rerunCommand) ?? productRerunCommand(targetId, input.runFlag, failureId)),
      severity: "high",
      ...(files.length > 0 ? { files } : {}),
      ...(productPaths.length > 0 ? { productPaths } : {})
    });
  }
}
