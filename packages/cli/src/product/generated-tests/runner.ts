import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import { generatedProductBaseUrl } from "./manifest";
import { elapsed, escapeRegExp, shellQuote } from "./strings";
import type {
  ProductGeneratedTestCase,
  ProductGeneratedTestFailure,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult
} from "../../types";
import type { ProductGeneratedTestDependencies } from "./dependencies";

type JsonRecord = Record<string, unknown>;

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

async function attachGeneratedFailureRetryEvidence(input: {
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

function resolveProjectPlaywrightTestCommand(
  rootDir: string,
  sourcePath: string,
  grepTitle?: string | undefined
): { ok: true; command: string } | { ok: false; error: string } {
  const absoluteSourcePath = join(rootDir, sourcePath);
  const grepArgs = grepTitle ? ` --grep ${shellQuote(`^${escapeRegExp(grepTitle)}$`)}` : "";
  const candidates = [
    join(rootDir, "node_modules", "playwright", "cli.js"),
    join(rootDir, "node_modules", "@playwright", "test", "cli.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        ok: true,
        command: `${shellQuote(process.execPath)} ${shellQuote(candidate)} test ${shellQuote(absoluteSourcePath)} --reporter=json${grepArgs}`
      };
    }
  }

  const bin = join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
  if (existsSync(bin)) {
    return {
      ok: true,
      command: `${shellQuote(bin)} test ${shellQuote(absoluteSourcePath)} --reporter=json${grepArgs}`
    };
  }

  return {
    ok: false,
    error: "Could not find a project-local Playwright CLI in node_modules/playwright, node_modules/@playwright/test, or node_modules/.bin."
  };
}

function parsePlaywrightTestRun(input: {
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

function createGeneratedTestFailure(input: {
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
