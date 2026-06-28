import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import YAML from "yaml";
import { normalizeExploreUrl, resolveMaybeUrl, sanitizeArtifactSegment } from "../exploration";
import {
  type OpenApiDocument,
  type ResolvedOpenApiSchema
} from "./openapi";
import {
  generatedProductBaseUrl,
  loadGeneratedProductApiTestsForTarget,
  loadGeneratedProductTestsForTarget
} from "./manifest";
import {
  defaultProductFlowMapPath,
  relativePathForArtifact,
  writeOutput
} from "./paths";
import { elapsed, escapeRegExp, shellQuote } from "./strings";
import {
  createConfiguredProductApiTestCases,
  createGeneratedProductApiTestCases,
  renderGeneratedProductApiTestSource
} from "./api";
import { createGeneratedProductTestCases, renderGeneratedProductTestSource } from "./ui";
import type {
  ProductFlowMap,
  ProductGeneratedTestCase,
  ProductGeneratedTestFailure,
  ProductGeneratedTestManifest,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult,
  ProductHealthResult
} from "../../types";

export { relativePathForArtifact } from "./paths";
export { normalizeProductPriorityPath, priorityRank } from "./priority";
export { escapeRegExp } from "./strings";
export { loadGeneratedProductApiTestsForTarget, loadGeneratedProductTestsForTarget } from "./manifest";

export interface ProductGeneratedTestDependencies {
  findPrioritizedProductPaths: (rootDir: string) => Set<string>;
  findImpactedProductFiles: (rootDir: string) => string[];
}

export function generateProductTestsForTarget(
  rootDir: string,
  target: CodeDecayProductTarget,
  flowMapArtifactPath: string | undefined,
  dependencies: ProductGeneratedTestDependencies
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated tests are written for review and are never committed or promoted automatically.",
    "Locator strategy prefers roles, labels, placeholders, and visible text before selector fallbacks."
  ];
  const sourceFlowMapPath = flowMapArtifactPath ?? defaultProductFlowMapPath(target.id);

  if (!existsSync(join(rootDir, sourceFlowMapPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Flow map artifact not found at ${sourceFlowMapPath}. Run codedecay product --target ${target.id} --explore first.`,
      notes
    };
  }

  let flowMap: ProductFlowMap;
  try {
    flowMap = JSON.parse(readFileSync(join(rootDir, sourceFlowMapPath), "utf8")) as ProductFlowMap;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read flow map ${sourceFlowMapPath}: ${message}`,
      notes
    };
  }

  const impactedPaths = dependencies.findPrioritizedProductPaths(rootDir);
  const tests = createGeneratedProductTestCases(flowMap, impactedPaths);
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "Flow map did not contain enough safe route, link, input, or form evidence to generate tests.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "product.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const source = renderGeneratedProductTestSource(flowMap, tests, sourceFlowMapPath);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl: flowMap.target.baseUrl
    },
    sourceFlowMapPath,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/e2e/codedecay-product.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes
  };
}

export function generateProductApiTestsForTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult | undefined,
  allowDestructiveActions: boolean,
  dependencies: ProductGeneratedTestDependencies
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated API tests are written for review and are never committed or promoted automatically.",
    "OpenAPI request checks accept documented non-5xx statuses and fail unexpected server errors.",
    "Mutating API methods are generated as skipped review cases unless --allow-destructive-actions is passed."
  ];
  const schema = resolveProductOpenApiSchema(rootDir, loadedConfig);
  if (!schema.ok && target.apiEndpoints.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: schema.error,
      notes
    };
  }

  let document: OpenApiDocument | undefined;
  if (schema.ok) {
    try {
      document = YAML.parse(readFileSync(schema.schema.absolutePath, "utf8")) as OpenApiDocument;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "failed",
        tests: [],
        durationMs: elapsed(startedAt),
        error: `Could not read OpenAPI schema ${schema.schema.schemaPath}: ${message}`,
        notes
      };
    }

    if (!document || typeof document !== "object" || !document.paths || typeof document.paths !== "object") {
      return {
        status: "blocked",
        tests: [],
        durationMs: elapsed(startedAt),
        error: `OpenAPI schema ${schema.schema.schemaPath} does not contain a usable paths object.`,
        notes
      };
    }
  } else if (target.apiEndpoints.length > 0) {
    notes.push(schema.error);
  }

  const baseUrl = resolveProductApiBaseUrl(loadedConfig, target, health, document);
  if (!baseUrl) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "API test generation requires productTesting.targets.<id>.baseUrl, previewUrlEnv, toolAdapters.schemathesis.baseUrl, healthCheck, or an absolute OpenAPI servers[0].url.",
      notes
    };
  }

  const impactedPaths = dependencies.findPrioritizedProductPaths(rootDir);
  const tests = [
    ...(document ? createGeneratedProductApiTestCases(document, baseUrl, impactedPaths) : []),
    ...createConfiguredProductApiTestCases(target.apiEndpoints, baseUrl, impactedPaths)
  ];
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: schema.ok
        ? `OpenAPI schema ${schema.schema.schemaPath} did not contain supported HTTP operations and no apiEndpoints are configured.`
        : "No supported configured apiEndpoints were found.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(target.id), "api.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const sourceLabel = schema.ok ? schema.schema.schemaPath : `productTesting.targets.${target.id}.apiEndpoints`;
  const source = renderGeneratedProductApiTestSource(target.id, baseUrl, sourceLabel, tests, allowDestructiveActions);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl
    },
    sourceOpenApiSchemaPath: schema.ok ? schema.schema.schemaPath : undefined,
    sourceApiEndpoints: target.apiEndpoints.length > 0 ? `productTesting.targets.${target.id}.apiEndpoints` : undefined,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/api/codedecay-api.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes: [
      ...notes,
      ...(schema.ok ? [`OpenAPI schema: ${schema.schema.schemaPath} (${schema.schema.source}).`] : []),
      ...(target.apiEndpoints.length > 0 ? [`Configured API endpoints: ${target.apiEndpoints.length}.`] : [])
    ]
  };
}

function resolveProductOpenApiSchema(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): { ok: true; schema: ResolvedOpenApiSchema } | { ok: false; error: string } {
  const configured = loadedConfig.config.toolAdapters.schemathesis?.schema;
  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return {
        ok: false,
        error: "HTTP(S) OpenAPI schema URLs are not fetched by codedecay product yet. Provide a local toolAdapters.schemathesis.schema file for local-first generation."
      };
    }

    const absolutePath = resolve(rootDir, configured);
    if (!existsSync(absolutePath)) {
      return {
        ok: false,
        error: `Configured OpenAPI schema not found at ${configured}.`
      };
    }

    return {
      ok: true,
      schema: {
        schemaPath: relativePathForArtifact(rootDir, absolutePath),
        absolutePath,
        source: "configured"
      }
    };
  }

  for (const candidate of [
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "docs/openapi.yaml",
    "docs/openapi.yml",
    "docs/openapi.json",
    "api/openapi.yaml",
    "api/openapi.yml",
    "api/openapi.json"
  ]) {
    const absolutePath = resolve(rootDir, candidate);
    if (existsSync(absolutePath)) {
      return {
        ok: true,
        schema: {
          schemaPath: candidate,
          absolutePath,
          source: "discovered"
        }
      };
    }
  }

  return {
    ok: false,
    error: "No OpenAPI schema found. Set toolAdapters.schemathesis.schema or add openapi.yaml, openapi.json, docs/openapi.yaml, or api/openapi.yaml."
  };
}

function resolveProductApiBaseUrl(
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult | undefined,
  document: OpenApiDocument | undefined
): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl ?? loadedConfig.config.toolAdapters.schemathesis?.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  if (health?.url) {
    const resolved = resolveMaybeUrl(health.url, health.url);
    if (resolved) {
      return new URL(resolved).origin;
    }
  }

  const serverUrl = document?.servers?.find((server) => typeof server.url === "string" && /^https?:\/\//i.test(server.url))?.url;
  return serverUrl ? normalizeExploreUrl(serverUrl) : undefined;
}

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
    const resultEntries = testEntries.flatMap((testEntry) => (Array.isArray(testEntry.results) ? testEntry.results : []));
    const statuses = resultEntries.map((result) => String(result.status ?? "")).filter(Boolean);
    const hasFailure = statuses.some((status) => ["failed", "timedOut", "interrupted"].includes(status)) || spec.ok === false;
    const hasSkip = statuses.some((status) => status === "skipped") || testEntries.some((testEntry) => testEntry.status === "skipped");

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

function collectPlaywrightSpecs(value: unknown): Array<Record<string, any>> {
  const specs: Array<Record<string, any>> = [];
  visit(value);
  return specs;

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, any>;
    if (Array.isArray(record.tests) && typeof record.title === "string") {
      specs.push(record);
    }

    for (const key of ["suites", "specs", "children"]) {
      if (Array.isArray(record[key])) {
        for (const child of record[key]) {
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

function extractPlaywrightError(value: any): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (typeof value.error?.message === "string") {
    return value.error.message;
  }

  if (Array.isArray(value.errors) && typeof value.errors[0]?.message === "string") {
    return value.errors[0].message;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  return undefined;
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
