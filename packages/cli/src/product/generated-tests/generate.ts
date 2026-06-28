import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import YAML from "yaml";
import { sanitizeArtifactSegment } from "../exploration";
import type {
  ProductFlowMap,
  ProductGeneratedTestManifest,
  ProductGeneratedTestsResult,
  ProductHealthResult
} from "../../types";
import {
  createConfiguredProductApiTestCases,
  createGeneratedProductApiTestCases,
  renderGeneratedProductApiTestSource
} from "./api";
import type { ProductGeneratedTestDependencies } from "./dependencies";
import { type OpenApiDocument } from "./openapi";
import {
  defaultProductFlowMapPath,
  writeOutput
} from "./paths";
import { resolveProductApiBaseUrl, resolveProductOpenApiSchema } from "./schema";
import { elapsed } from "./strings";
import { createGeneratedProductTestCases, renderGeneratedProductTestSource } from "./ui";

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
