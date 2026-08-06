import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ServiceTopologyEdge, ServiceTopologyGraph, ServiceTopologyNode, ServiceTopologySource } from "../types";
import { SERVICE_TOPOLOGY_SCHEMA_VERSION } from "../types";

export interface ParseOpenApiTopologyOptions {
  rootDir: string;
  path: string;
  repositoryId: string;
  revision: string;
  now?: Date | undefined;
  producerServiceId?: string | undefined;
}

/**
 * Local-only OpenAPI 3 adapter.
 * Uses the maintained `yaml` parser for YAML documents and JSON.parse for JSON.
 * Does not resolve remote $ref, clone repositories, or call the network.
 */
export function parseOpenApiTopology(options: ParseOpenApiTopologyOptions): ServiceTopologyGraph {
  const rootDir = realpathSync(options.rootDir);
  const absolutePath = resolveInside(rootDir, options.path);
  if (!absolutePath || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`OpenAPI contract not found inside repository: ${options.path}`);
  }
  const raw = readFileSync(absolutePath, "utf8");
  const document = options.path.endsWith(".json") ? JSON.parse(raw) as unknown : parseYaml(raw) as unknown;
  if (!isRecord(document)) throw new Error(`OpenAPI contract must be an object: ${options.path}`);
  assertNoRemoteRefs(document, options.path);

  const openapi = typeof document.openapi === "string" ? document.openapi : undefined;
  if (!openapi || !openapi.startsWith("3.")) {
    throw new Error(`Unsupported OpenAPI version in ${options.path}. Expected OpenAPI 3.x.`);
  }

  const observedAt = (options.now ?? new Date()).toISOString();
  const source: ServiceTopologySource = {
    kind: "openapi",
    source: options.path,
    repositoryId: options.repositoryId,
    revision: options.revision,
    observedAt
  };
  const info = isRecord(document.info) ? document.info : {};
  const title = typeof info.title === "string" && info.title.length > 0 ? info.title : options.path;
  const nodes: ServiceTopologyNode[] = [];
  const edges: ServiceTopologyEdge[] = [];
  const paths = isRecord(document.paths) ? document.paths : {};

  for (const [routePath, pathItem] of Object.entries(paths).sort(([left], [right]) => left.localeCompare(right))) {
    if (!isRecord(pathItem)) continue;
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"].filter((candidate) => isRecord(pathItem[candidate]))) {
      const operation = pathItem[method] as Record<string, unknown>;
      const operationId =
        typeof operation.operationId === "string" && operation.operationId.length > 0
          ? operation.operationId
          : `${method.toUpperCase()} ${routePath}`;
      const nodeId = topologyContractId("api", options.repositoryId, options.path, method, routePath);
      nodes.push({
        id: nodeId,
        kind: "api",
        label: `${title}: ${operationId}`,
        repositoryId: options.repositoryId,
        confidence: "declared",
        freshness: "current",
        trustClass: "declared-context",
        sources: [source],
        limitations: [
          "Derived from a local OpenAPI document without remote $ref resolution.",
          "Does not prove runtime exposure or consumer compatibility by itself."
        ],
        metadata: {
          openapiPath: options.path,
          method: method.toUpperCase(),
          route: routePath,
          operationId
        }
      });
      if (options.producerServiceId) {
        edges.push({
          id: topologyContractId("edge", options.producerServiceId, "produces", nodeId),
          from: options.producerServiceId,
          to: nodeId,
          kind: "produces",
          confidence: "declared",
          freshness: "current",
          trustClass: "declared-context",
          sources: [source],
          limitations: ["Producer linkage came from explicit adapter options, not service discovery."]
        });
      }
    }
  }

  return {
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    generatedAt: observedAt,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    limitations: [
      "OpenAPI adapter is local-only: no remote $ref fetch, network discovery, install, model, or telemetry calls."
    ]
  };
}

export function topologyContractId(...parts: string[]): string {
  return `topology:${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 20)}`;
}

function assertNoRemoteRefs(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoRemoteRefs(entry, path);
    return;
  }
  if (!isRecord(value)) return;
  const ref = value.$ref;
  if (typeof ref === "string" && /^https?:\/\//i.test(ref)) {
    throw new Error(`OpenAPI remote $ref is blocked for local-only topology parsing (${path}): ${ref}`);
  }
  for (const nested of Object.values(value)) assertNoRemoteRefs(nested, path);
}

function resolveInside(rootDir: string, path: string): string | undefined {
  const resolved = resolve(rootDir, path);
  return resolved === rootDir || resolved.startsWith(`${rootDir}/`) ? resolved : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
