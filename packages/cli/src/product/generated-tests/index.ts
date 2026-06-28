import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import YAML from "yaml";
import { normalizeExploreUrl, resolveMaybeUrl, sanitizeArtifactSegment } from "../exploration";
import {
  type OpenApiDocument,
  type ResolvedOpenApiSchema
} from "./openapi";
import {
  loadGeneratedProductApiTestsForTarget,
  loadGeneratedProductTestsForTarget
} from "./manifest";
import {
  defaultProductFlowMapPath,
  relativePathForArtifact,
  writeOutput
} from "./paths";
import { elapsed } from "./strings";
import {
  createConfiguredProductApiTestCases,
  createGeneratedProductApiTestCases,
  renderGeneratedProductApiTestSource
} from "./api";
import { createGeneratedProductTestCases, renderGeneratedProductTestSource } from "./ui";
import type {
  ProductFlowMap,
  ProductGeneratedTestManifest,
  ProductGeneratedTestsResult,
  ProductHealthResult
} from "../../types";

export { relativePathForArtifact } from "./paths";
export { normalizeProductPriorityPath, priorityRank } from "./priority";
export { escapeRegExp } from "./strings";
export { loadGeneratedProductApiTestsForTarget, loadGeneratedProductTestsForTarget } from "./manifest";
export { runGeneratedProductTests } from "./runner";

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
