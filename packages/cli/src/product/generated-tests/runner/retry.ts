import type { LoadedCodeDecayConfig, CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import { generatedProductBaseUrl } from "../manifest";
import type {
  ProductGeneratedTestCase,
  ProductGeneratedTestFailure,
  ProductGeneratedTestsResult
} from "../../../types";
import { parsePlaywrightTestRun } from "./parse";
import { resolveProjectPlaywrightTestCommand } from "./playwright-command";

export async function attachGeneratedFailureRetryEvidence(input: {
  failures: ProductGeneratedTestFailure[];
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  loadedConfig: LoadedCodeDecayConfig;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
  impactedFiles: string[];
}): Promise<ProductGeneratedTestFailure[]> {
  const retryLimit = 3;
  const annotated: ProductGeneratedTestFailure[] = [];
  let retried = 0;

  for (const failure of input.failures) {
    const testCase = generatedTestCaseForFailure(input.generatedTests, failure);
    if (!testCase) {
      annotated.push({
        ...failure,
        retryEvidence: {
          attempts: 1,
          passed: 0,
          failed: 1,
          conclusion: "not-rerun",
          error: "No generated test id or title matched this failure."
        }
      });
      continue;
    }

    if (retried >= retryLimit) {
      annotated.push({
        ...failure,
        retryEvidence: {
          attempts: 1,
          passed: 0,
          failed: 1,
          conclusion: "not-rerun",
          error: `Retry evidence cap reached after ${retryLimit} failed generated checks.`
        }
      });
      continue;
    }

    const retryCommand = resolveProjectPlaywrightTestCommand(input.rootDir, input.generatedTests.sourcePath ?? "", testCase.title);
    if (!retryCommand.ok) {
      annotated.push({
        ...failure,
        retryEvidence: {
          attempts: 1,
          passed: 0,
          failed: 1,
          conclusion: "not-rerun",
          error: retryCommand.error
        }
      });
      continue;
    }

    retried += 1;
    const execution = await runConfiguredCommand({
      command: retryCommand.command,
      cwd: input.rootDir,
      timeoutMs: input.target.timeoutMs,
      env: {
        CODEDECAY_PRODUCT_BASE_URL: generatedProductBaseUrl(input.rootDir, input.generatedTests)
      },
      safety: {
        allowCommands: input.loadedConfig.config.safety.allowCommands
      }
    });
    const parsed = parsePlaywrightTestRun({
      stdout: execution.stdout,
      generatedTests: input.generatedTests,
      testSource: input.testSource,
      target: input.target,
      rootDir: input.rootDir,
      rerunFlag: input.rerunFlag,
      impactedFiles: input.impactedFiles
    });
    const rerunPassed = execution.status === "passed" && parsed.failed === 0;
    const rerunError =
      execution.error ??
      parsed.failures[0]?.error ??
      (execution.stderr.trim() || (rerunPassed ? undefined : `Targeted generated test rerun exited with status ${execution.status}.`));

    annotated.push({
      ...failure,
      retryEvidence: {
        attempts: 2,
        passed: rerunPassed ? 1 : 0,
        failed: rerunPassed ? 1 : 2,
        command: retryCommand.command,
        conclusion: rerunPassed ? "passed-on-rerun" : "failed-on-rerun",
        error: rerunError
      }
    });
  }

  return annotated;
}

function generatedTestCaseForFailure(
  generatedTests: ProductGeneratedTestsResult,
  failure: ProductGeneratedTestFailure
): ProductGeneratedTestCase | undefined {
  if (failure.testId) {
    return generatedTests.tests.find((test) => test.id === failure.testId);
  }

  return generatedTests.tests.find((test) => test.title === failure.title || failure.title.includes(test.title));
}
