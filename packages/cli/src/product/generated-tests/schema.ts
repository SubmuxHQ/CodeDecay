import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { normalizeExploreUrl, resolveMaybeUrl } from "../exploration";
import type { ProductHealthResult } from "../../types";
import type { OpenApiDocument, ResolvedOpenApiSchema } from "./openapi";
import { relativePathForArtifact } from "./paths";

export function resolveProductOpenApiSchema(
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

export function resolveProductApiBaseUrl(
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
