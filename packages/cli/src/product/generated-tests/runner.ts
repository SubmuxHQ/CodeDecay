import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import { generatedProductBaseUrl } from "./manifest";
import { elapsed } from "./strings";
import type {
  ProductGeneratedTestFailure,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult
} from "../../types";
import type { ProductGeneratedTestDependencies } from "./dependencies";
import { createGeneratedTestFailure } from "./runner/failure";
import { parsePlaywrightTestRun } from "./runner/parse";
import { resolveProjectPlaywrightTestCommand } from "./runner/playwright-command";
import { attachGeneratedFailureRetryEvidence } from "./runner/retry";

export async function runGeneratedProductTests(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  generatedTests: ProductGeneratedTestsResult,
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests",
  testId: string | undefined,
  dependencies: ProductGeneratedTestDependencies
): Promise<ProductGeneratedTestRunResult> {
  const startedAt = Date.now();
  const notes = [
    "Generated tests run only from the local generated-tests artifact path.",
    "Use the rerun command after reviewing or editing the generated test source."
  ];

  if (!generatedTests.sourcePath || generatedTests.tests.length === 0) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: "",
      error: "Generated test source is missing; run --generate-tests first.",
      notes
    };
  }

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: "Generated test execution is disabled by config safety.allowCommands.",
      error: "Generated test execution requires safety.allowCommands to be true.",
      notes
    };
  }

  const selectedTest = testId ? generatedTests.tests.find((test) => test.id === testId) : undefined;
  if (testId && !selectedTest) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: `Generated test id ${testId} was not found in ${generatedTests.manifestPath ?? "the generated test manifest"}.`,
      error: `Generated test id ${testId} was not found.`,
      notes
    };
  }

  const command = resolveProjectPlaywrightTestCommand(rootDir, generatedTests.sourcePath, selectedTest?.title);
  if (!command.ok) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: command.error,
      error: command.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install packages or browsers."]
    };
  }

  const execution = await runConfiguredCommand({
    command: command.command,
    cwd: rootDir,
    timeoutMs: target.timeoutMs,
    env: {
      CODEDECAY_PRODUCT_BASE_URL: generatedProductBaseUrl(rootDir, generatedTests)
    },
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
  const testSource = readFileSync(join(rootDir, generatedTests.sourcePath), "utf8");
  const impactedFiles = dependencies.findImpactedProductFiles(rootDir);
  const parsed = parsePlaywrightTestRun({
    stdout: execution.stdout,
    generatedTests,
    testSource,
    target,
    rootDir,
    rerunFlag,
    impactedFiles
  });
  const failed = parsed.failed > 0 || execution.status !== "passed";
  const fallbackFailures =
    failed && parsed.failures.length === 0
      ? [
          createGeneratedTestFailure({
            title: "Generated Playwright command",
            failingStep: "Run generated Playwright regression tests.",
            error: execution.error ?? (execution.stderr.trim() || `Playwright command exited with status ${execution.status}.`),
            generatedTests,
            testSource,
            target,
            rootDir,
            rerunFlag,
            impactedFiles
          })
        ]
      : parsed.failures;
  const failures = failed
    ? await attachGeneratedFailureRetryEvidence({
        failures: fallbackFailures,
        generatedTests,
        testSource,
        target,
        rootDir,
        loadedConfig,
        rerunFlag,
        impactedFiles
      })
    : fallbackFailures;

  return {
    status: failed ? "failed" : "passed",
    command: command.command,
    durationMs: elapsed(startedAt),
    passed: parsed.passed,
    failed: failed ? Math.max(parsed.failed, failures.length) : parsed.failed,
    skipped: parsed.skipped,
    failures,
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    error: failed ? execution.error : undefined,
    notes
  };
}
