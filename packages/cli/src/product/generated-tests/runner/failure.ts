import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type {
  ProductGeneratedTestCase,
  ProductGeneratedTestFailure,
  ProductGeneratedTestsResult
} from "../../../types";
import { shellQuote } from "../strings";

export function createGeneratedTestFailure(input: {
  testId?: string | undefined;
  title: string;
  failingStep: string;
  error: string;
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
  impactedFiles: string[];
}): ProductGeneratedTestFailure {
  const testCase =
    input.testId !== undefined
      ? input.generatedTests.tests.find((candidate) => candidate.id === input.testId)
      : input.generatedTests.tests.find((candidate) => candidate.title === input.title || input.title.includes(candidate.title));
  const testIdArg = testCase ? ` --test-id ${shellQuote(testCase.id)}` : "";
  return {
    testId: input.testId,
    title: input.title,
    failingStep: input.failingStep,
    error: input.error,
    request:
      testCase?.method && testCase.operationPath
        ? {
            method: testCase.method,
            url: testCase.pageUrl
          }
        : undefined,
    expected: expectedGeneratedTestBehavior(testCase),
    actual: input.error,
    impactedFiles: input.impactedFiles.length > 0 ? input.impactedFiles : undefined,
    testSourcePath: input.generatedTests.sourcePath ?? "",
    testSource: input.testSource,
    rerunCommand: `npx codedecay product --target ${input.target.id} ${input.rerunFlag}${testIdArg} --format markdown`
  };
}

function expectedGeneratedTestBehavior(testCase: ProductGeneratedTestCase | undefined): string | undefined {
  if (!testCase) {
    return undefined;
  }

  if (testCase.kind === "api-operation") {
    const statusText =
      testCase.expectedStatuses && testCase.expectedStatuses.length > 0
        ? `one of the documented statuses ${testCase.expectedStatuses.join(", ")}`
        : "a non-5xx response";
    return `${testCase.method ?? "GET"} ${testCase.operationPath ?? testCase.pageUrl} should return ${statusText}.`;
  }

  return `${testCase.title} should pass in the generated product regression suite.`;
}
