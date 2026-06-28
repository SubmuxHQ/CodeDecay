import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CodeDecayProductApiEndpoint, CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { runConfiguredCommand } from "@submuxhq/codedecay-execution";
import YAML from "yaml";
import { normalizeExploreUrl, resolveMaybeUrl, sanitizeArtifactSegment } from "../exploration";
import {
  PRODUCT_API_METHODS,
  SAFE_PRODUCT_API_METHODS,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiPathItem,
  type OpenApiSchema,
  type ProductHttpMethod,
  type ResolvedOpenApiSchema
} from "./openapi";
import {
  generatedProductBaseUrl,
  loadGeneratedProductApiTestsForTarget,
  loadGeneratedProductTestsForTarget
} from "./manifest";
import { priorityForPath, priorityRank } from "./priority";
import {
  defaultProductFlowMapPath,
  relativePathForArtifact,
  writeOutput
} from "./paths";
import { elapsed, escapeRegExp, generatedTestId, regexLiteralForText, shellQuote } from "./strings";
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

function createGeneratedProductApiTestCases(
  document: OpenApiDocument,
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();
  const paths = document.paths ?? {};

  for (const path of Object.keys(paths).sort((left, right) => left.localeCompare(right))) {
    const pathItem = paths[path];
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of PRODUCT_API_METHODS) {
      const operation = pathItem[method.toLowerCase() as Lowercase<ProductHttpMethod>];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const operationPath = sampleOpenApiOperationPath(path, pathItem, operation);
      const expectedStatuses = openApiExpectedStatuses(operation);
      const destructive = !SAFE_PRODUCT_API_METHODS.has(method);
      const id = generatedTestId("api", method, path, operation.operationId ?? "");
      addGeneratedTestCase(tests, seen, {
        id,
        title: `${method} ${path} returns a documented status`,
        kind: "api-operation",
        pageUrl: new URL(operationPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
        method,
        operationPath,
        operationId: operation.operationId,
        expectedStatuses,
        requestBody: destructive ? sampleOpenApiRequestBody(operation) : undefined,
        destructive,
        priority: priorityForPath(path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function createConfiguredProductApiTestCases(
  endpoints: CodeDecayProductApiEndpoint[],
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();

  for (const endpoint of endpoints) {
    const destructive = !SAFE_PRODUCT_API_METHODS.has(endpoint.method);
    const id = endpoint.id ?? generatedTestId("api", "configured", endpoint.method, endpoint.path);
    addGeneratedTestCase(tests, seen, {
      id,
      title: `${endpoint.method} ${endpoint.path} returns a configured status`,
      kind: "api-operation",
      pageUrl: new URL(endpoint.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
      method: endpoint.method,
      operationPath: endpoint.path,
      expectedStatuses: endpoint.expectedStatuses,
      headers: endpoint.headers,
      requestBody: endpoint.body,
      destructive,
      priority: priorityForPath(endpoint.path, impactedPaths)
    });
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function renderGeneratedProductApiTestSource(
  targetId: string,
  baseUrl: string,
  sourceSchemaPath: string,
  tests: ProductGeneratedTestCase[],
  allowDestructiveActions: boolean
): string {
  const lines = [
    "import { test } from '@playwright/test';",
    "",
    "// @generated by CodeDecay. Review before promoting into your permanent test suite.",
    `// codedecay:source-openapi-schema=${sourceSchemaPath}`,
    `// codedecay:target=${targetId}`,
    "",
    `const CODEDECAY_API_BASE_URL = process.env.CODEDECAY_PRODUCT_BASE_URL ?? ${JSON.stringify(baseUrl)};`,
    "",
    "function apiUrl(path: string): string {",
    "  return new URL(path, CODEDECAY_API_BASE_URL.endsWith('/') ? CODEDECAY_API_BASE_URL : `${CODEDECAY_API_BASE_URL}/`).toString();",
    "}",
    "",
    "async function responseSnippet(response: { text: () => Promise<string> }): Promise<string> {",
    "  try {",
    "    return (await response.text()).replace(/\\s+/g, ' ').trim().slice(0, 500);",
    "  } catch {",
    "    return '';",
    "  }",
    "}",
    "",
    `test.describe(${JSON.stringify(`CodeDecay generated API regression tests (${targetId})`)}, () => {`
  ];

  for (const testCase of tests) {
    const declaration = testCase.destructive && !allowDestructiveActions ? "test.skip" : "test";
    lines.push(
      "",
      `  ${declaration}(${JSON.stringify(testCase.title)}, async ({ request }) => {`,
      `    test.info().annotations.push({ type: 'codedecay.testId', description: ${JSON.stringify(testCase.id)} });`
    );
    appendGeneratedApiTestBody(lines, testCase);
    lines.push("  });");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function appendGeneratedApiTestBody(lines: string[], testCase: ProductGeneratedTestCase): void {
  const method = testCase.method ?? "GET";
  const operationPath = testCase.operationPath ?? new URL(testCase.pageUrl).pathname;
  const expectedStatuses = testCase.expectedStatuses ?? [];
  const requestBody = testCase.requestBody;
  const headers =
    requestBody === undefined
      ? { accept: "application/json", ...(testCase.headers ?? {}) }
      : { accept: "application/json", "content-type": "application/json", ...(testCase.headers ?? {}) };
  lines.push("    const response = await request.fetch(");
  lines.push(`      apiUrl(${JSON.stringify(operationPath)}),`);
  lines.push("      {");
  lines.push(`        method: ${JSON.stringify(method)},`);
  lines.push(`        headers: ${JSON.stringify(headers)}${requestBody === undefined ? "" : ","}`);
  if (requestBody !== undefined) {
    lines.push(`        data: ${JSON.stringify(requestBody, null, 10).replace(/\n/g, "\n        ")}`);
  }
  lines.push("      }");
  lines.push("    );");
  lines.push("    const status = response.status();");
  if (expectedStatuses.length > 0) {
    lines.push(`    const expectedStatuses = ${JSON.stringify(expectedStatuses)};`);
    lines.push("    if (!expectedStatuses.includes(status)) {");
    lines.push("      throw new Error(`Expected documented status ${expectedStatuses.join(', ')} but got ${status}. Body: ${await responseSnippet(response)}`);");
    lines.push("    }");
  } else {
    lines.push("    if (status >= 500) {");
    lines.push("      throw new Error(`Expected a non-5xx API response but got ${status}. Body: ${await responseSnippet(response)}`);");
    lines.push("    }");
  }
}

function sampleOpenApiRequestBody(operation: OpenApiOperation): unknown {
  const content = operation.requestBody?.content;
  const jsonMedia = content?.["application/json"] ?? content?.["application/problem+json"] ?? Object.values(content ?? {}).find(Boolean);
  if (!jsonMedia) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (jsonMedia.example !== undefined) {
    return jsonMedia.example;
  }

  return sampleOpenApiSchemaValue(jsonMedia.schema);
}

function sampleOpenApiSchemaValue(schema: OpenApiSchema | undefined): unknown {
  if (!schema) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (schema.type === "array") {
    return [sampleOpenApiSchemaValue(schema.items)];
  }

  if (schema.type === "integer" || schema.type === "number") {
    return 1;
  }

  if (schema.type === "boolean") {
    return true;
  }

  if (schema.type === "string") {
    if (schema.format === "email") {
      return "codedecay@example.com";
    }

    if (schema.format === "uri" || schema.format === "url") {
      return "https://example.com";
    }

    if (schema.format === "uuid") {
      return "00000000-0000-4000-8000-000000000001";
    }

    return "codedecay";
  }

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? Object.keys(properties));
  const value: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (!required.has(name)) {
      continue;
    }

    value[name] = sampleOpenApiSchemaValue(property);
  }

  return Object.keys(value).length > 0 ? value : { codedecay: "review-before-running" };
}

function sampleOpenApiOperationPath(path: string, pathItem: OpenApiPathItem, operation: OpenApiOperation): string {
  const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const replacedPath = path.replace(/\{([^}]+)\}/g, (_match, name: string) => encodeURIComponent(String(sampleOpenApiParameterValue(name, parameters))));
  const query = new URLSearchParams();

  for (const parameter of parameters) {
    if (parameter.in !== "query" || !parameter.name || parameter.required !== true) {
      continue;
    }

    query.set(parameter.name, String(sampleOpenApiParameterValue(parameter.name, parameters)));
  }

  const queryString = query.toString();
  return queryString ? `${replacedPath}?${queryString}` : replacedPath;
}

function sampleOpenApiParameterValue(name: string, parameters: OpenApiParameter[]): string | number | boolean {
  const parameter = parameters.find((candidate) => candidate.name === name);
  const schema = parameter?.schema;
  const lowerName = name.toLowerCase();

  if (parameter?.example !== undefined) {
    return primitiveSampleValue(parameter.example);
  }

  if (schema?.example !== undefined) {
    return primitiveSampleValue(schema.example);
  }

  if (schema?.default !== undefined) {
    return primitiveSampleValue(schema.default);
  }

  if (Array.isArray(schema?.enum) && schema.enum.length > 0) {
    return primitiveSampleValue(schema.enum[0]);
  }

  if (schema?.type === "integer" || schema?.type === "number" || /\b(id|count|page|limit|offset)\b/i.test(lowerName)) {
    return 1;
  }

  if (schema?.type === "boolean") {
    return true;
  }

  if (schema?.format === "email" || lowerName.includes("email")) {
    return "codedecay@example.com";
  }

  if (schema?.format === "uuid" || lowerName.includes("uuid")) {
    return "00000000-0000-4000-8000-000000000001";
  }

  return "codedecay";
}

function primitiveSampleValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return "codedecay";
  }

  return JSON.stringify(value);
}

function openApiExpectedStatuses(operation: OpenApiOperation): number[] {
  return Object.keys(operation.responses ?? {})
    .filter((status) => /^\d{3}$/.test(status))
    .map((status) => Number(status))
    .filter((status) => status >= 100 && status < 500)
    .sort((left, right) => left - right);
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

function addGeneratedTestCase(tests: ProductGeneratedTestCase[], seen: Set<string>, test: ProductGeneratedTestCase): void {
  if (seen.has(test.id)) {
    return;
  }

  seen.add(test.id);
  tests.push(test);
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
