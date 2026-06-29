import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type {
  ProductGeneratedTestFailure,
  ProductGeneratedTestsResult
} from "../../../types";
import { createGeneratedTestFailure } from "./failure";
import type { JsonRecord } from "./types";

export function parsePlaywrightTestRun(input: {
  stdout: string;
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
  impactedFiles: string[];
}): { passed: number; failed: number; skipped: number; failures: ProductGeneratedTestFailure[] } {
  const parsed = parseJsonFromOutput(input.stdout);
  if (!parsed || typeof parsed !== "object") {
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  const specs = collectPlaywrightSpecs(parsed);
  if (specs.length === 0) {
    return {
      passed: input.generatedTests.tests.length,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: ProductGeneratedTestFailure[] = [];

  for (const spec of specs) {
    const title = typeof spec.title === "string" ? spec.title : "Generated Playwright test";
    const matchingTest = input.generatedTests.tests.find((test) => test.title === title || title.includes(test.title));
    const testEntries = Array.isArray(spec.tests) ? spec.tests : [];
    const resultEntries = testEntries.flatMap((testEntry) => {
      if (!isRecord(testEntry) || !Array.isArray(testEntry.results)) {
        return [];
      }

      return testEntry.results;
    });
    const statuses = resultEntries.map((result) => (isRecord(result) ? String(result.status ?? "") : "")).filter(Boolean);
    const hasFailure = statuses.some((status) => ["failed", "timedOut", "interrupted"].includes(status)) || spec.ok === false;
    const hasSkip =
      statuses.some((status) => status === "skipped") ||
      testEntries.some((testEntry) => isRecord(testEntry) && testEntry.status === "skipped");

    if (hasFailure) {
      failed += 1;
      const firstFailedResult = resultEntries.find((result) => ["failed", "timedOut", "interrupted"].includes(String(result.status ?? "")));
      failures.push(
        createGeneratedTestFailure({
          testId: matchingTest?.id,
          title,
          failingStep: `Run generated test "${title}".`,
          error: extractPlaywrightError(firstFailedResult) ?? extractPlaywrightError(spec) ?? "Generated Playwright test failed.",
          generatedTests: input.generatedTests,
          testSource: input.testSource,
          target: input.target,
          rootDir: input.rootDir,
          rerunFlag: input.rerunFlag,
          impactedFiles: input.impactedFiles
        })
      );
    } else if (hasSkip) {
      skipped += 1;
    } else {
      passed += 1;
    }
  }

  return {
    passed,
    failed,
    skipped,
    failures
  };
}

function collectPlaywrightSpecs(value: unknown): JsonRecord[] {
  const specs: JsonRecord[] = [];
  visit(value);
  return specs;

  function visit(node: unknown): void {
    if (!isRecord(node)) {
      return;
    }

    if (Array.isArray(node.tests) && typeof node.title === "string") {
      specs.push(node);
    }

    for (const key of ["suites", "specs", "children"]) {
      const children = node[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          visit(child);
        }
      }
    }
  }
}

function parseJsonFromOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return undefined;
    }
  }
}

function extractPlaywrightError(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }

  if (Array.isArray(value.errors) && isRecord(value.errors[0]) && typeof value.errors[0].message === "string") {
    return value.errors[0].message;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  return undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object";
}
