import { dedupeStrings } from "@submuxhq/codedecay-core";
import { normalizeProductPath } from "../schema";
import type { CodeDecayMemory } from "../types";
import { asRecord, stringArray, stringValue } from "./records";
import { safeLearnedText } from "./text";

export function appendLearnedProductReport(memory: CodeDecayMemory, report: Record<string, unknown>): void {
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
      runFlag: "--run-generated-tests"
    });
    appendLearnedProductGeneratedChecks(memory, target, {
      generatedKey: "generatedApiTests",
      runKey: "generatedApiTestRun",
      area: "api",
      runFlag: "--run-generated-api-tests"
    });
    appendLearnedProductWorkflowFailure(memory, target);
  }
}

function appendLearnedProductGeneratedChecks(
  memory: CodeDecayMemory,
  target: Record<string, unknown>,
  input: {
    generatedKey: "generatedTests" | "generatedApiTests";
    runKey: "generatedTestRun" | "generatedApiTestRun";
    area: "ui" | "api";
    runFlag: "--run-generated-tests" | "--run-generated-api-tests";
  }
): void {
  const generated = asRecord(target[input.generatedKey]);
  const run = asRecord(target[input.runKey]);
  const tests = Array.isArray(generated?.tests) ? generated.tests : [];
  const failures = Array.isArray(run?.failures) ? run.failures : [];
  const targetId = stringValue(target.id) ?? "product";
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

function appendLearnedProductWorkflowFailure(memory: CodeDecayMemory, target: Record<string, unknown>): void {
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

  const targetId = stringValue(target.id) ?? "product";
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

function productPathsFromTest(test: Record<string, unknown> | undefined): string[] {
  if (!test) {
    return [];
  }

  return dedupeStrings(
    [
      productPathFromUnknown(test.operationPath),
      productPathFromUnknown(test.pageUrl),
      productPathFromUnknown(test.targetUrl)
    ].filter((path): path is string => Boolean(path))
  );
}

function productPathsFromFailure(failure: Record<string, unknown>): string[] {
  const request = asRecord(failure.request);
  return dedupeStrings([productPathFromUnknown(request?.url)].filter((path): path is string => Boolean(path)));
}

function productPathFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return normalizeProductPath(url.pathname);
  } catch {
    if (!trimmed.startsWith("/")) {
      return undefined;
    }

    return normalizeProductPath(trimmed.split(/[?#]/, 1)[0] ?? trimmed);
  }
}

function productRerunCommand(
  targetId: string,
  runFlag: "--run-generated-tests" | "--run-generated-api-tests",
  testId: string | undefined
): string {
  const testIdArg = testId ? ` --test-id ${testId}` : "";
  return `npx codedecay product --target ${targetId} ${runFlag}${testIdArg} --format markdown`;
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
