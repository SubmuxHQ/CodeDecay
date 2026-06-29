import type {
  ProductCheckKind,
  ProductFailureArtifact,
  ProductFailureBundle
} from "../types";
import { classifyGeneratedProductFailure } from "./classification";
import { productFailureSuggestedFixTasks } from "./suggestions";
import { asRecord, slugId, stringArray, stringValue } from "./utils";

export function productFailureBundlesFromGeneratedRun(
  target: Record<string, unknown>,
  runKey: "generatedTestRun" | "generatedApiTestRun",
  checkKind: ProductCheckKind
): ProductFailureBundle[] {
  const run = asRecord(target[runKey]);
  const failures = Array.isArray(run?.failures) ? run.failures : [];
  const targetId = stringValue(target.id) ?? "product";
  const targetBaseUrl = stringValue(target.baseUrl);
  const bundles: ProductFailureBundle[] = [];

  for (const failureValue of failures) {
    const failure = asRecord(failureValue);
    if (!failure) {
      continue;
    }

    const title = stringValue(failure.title) ?? "Generated product check failed";
    const testId = stringValue(failure.testId) ?? slugId(title);
    const request = asRecord(failure.request);
    const method = stringValue(request?.method);
    const url = stringValue(request?.url);
    const sourcePath = stringValue(failure.testSourcePath);
    const expected = stringValue(failure.expected) ?? "Generated product check should pass.";
    const actual = stringValue(failure.actual) ?? stringValue(failure.error) ?? "Generated product check failed.";
    const rerunCommand =
      stringValue(failure.rerunCommand) ??
      `npx codedecay product --target ${targetId} ${checkKind === "api" ? "--run-generated-api-tests" : "--run-generated-tests"} --test-id ${testId} --format markdown`;
    const classification = classifyGeneratedProductFailure(failure, checkKind);

    const artifacts: ProductFailureArtifact[] = [];
    if (sourcePath) {
      artifacts.push({
        kind: "test-source",
        path: sourcePath,
        label: "generated test source"
      });
    }

    if (method && url) {
      artifacts.push({
        kind: "request-response-diff",
        label: `${method} ${url}`,
        description: actual
      });
    }

    bundles.push({
      schemaVersion: 1,
      id: slugId(`${targetId}-${checkKind}-${testId}`),
      checkId: testId,
      checkKind,
      priority: "high",
      target: targetBaseUrl ? { id: targetId, baseUrl: targetBaseUrl } : { id: targetId },
      title,
      summary: stringValue(failure.error) ?? actual,
      classification: classification.classification,
      classificationConfidence: classification.confidence,
      classificationEvidence: classification.evidence,
      failedStep: {
        index: 1,
        label: stringValue(failure.failingStep) ?? `Run generated ${checkKind} check ${testId}.`,
        status: "failed",
        expected,
        actual
      },
      neighboringSteps: [],
      artifacts,
      expected,
      actual,
      impactedFiles: stringArray(failure.impactedFiles),
      suggestedFixTasks: productFailureSuggestedFixTasks(classification.classification, checkKind),
      rerunCommand
    });
  }

  return bundles;
}
