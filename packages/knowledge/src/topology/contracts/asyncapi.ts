import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ServiceTopologyEdge, ServiceTopologyGraph, ServiceTopologyNode, ServiceTopologySource } from "../types";
import { SERVICE_TOPOLOGY_SCHEMA_VERSION } from "../types";
import { topologyContractId } from "./openapi";

export interface ParseAsyncApiTopologyOptions {
  rootDir: string;
  path: string;
  repositoryId: string;
  revision: string;
  now?: Date | undefined;
  publisherServiceId?: string | undefined;
  subscriberServiceId?: string | undefined;
}

/**
 * Local-only AsyncAPI 2/3 adapter.
 * Uses the maintained `yaml` parser for YAML documents and JSON.parse for JSON.
 * Does not resolve remote $ref, clone repositories, or call the network.
 */
export function parseAsyncApiTopology(options: ParseAsyncApiTopologyOptions): ServiceTopologyGraph {
  const rootDir = realpathSync(options.rootDir);
  const absolutePath = resolveInside(rootDir, options.path);
  if (!absolutePath || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`AsyncAPI contract not found inside repository: ${options.path}`);
  }
  const raw = readFileSync(absolutePath, "utf8");
  const document = options.path.endsWith(".json") ? JSON.parse(raw) as unknown : parseYaml(raw) as unknown;
  if (!isRecord(document)) throw new Error(`AsyncAPI contract must be an object: ${options.path}`);
  assertNoRemoteRefs(document, options.path);

  const asyncapi = typeof document.asyncapi === "string" ? document.asyncapi : undefined;
  if (!asyncapi || !(asyncapi.startsWith("2.") || asyncapi.startsWith("3."))) {
    throw new Error(`Unsupported AsyncAPI version in ${options.path}. Expected AsyncAPI 2.x or 3.x.`);
  }

  const observedAt = (options.now ?? new Date()).toISOString();
  const source: ServiceTopologySource = {
    kind: "asyncapi",
    source: options.path,
    repositoryId: options.repositoryId,
    revision: options.revision,
    observedAt
  };
  const info = isRecord(document.info) ? document.info : {};
  const title = typeof info.title === "string" && info.title.length > 0 ? info.title : options.path;
  const nodes: ServiceTopologyNode[] = [];
  const edges: ServiceTopologyEdge[] = [];
  const channels = isRecord(document.channels) ? document.channels : {};

  for (const [channelName, channelValue] of Object.entries(channels).sort(([left], [right]) => left.localeCompare(right))) {
    if (!isRecord(channelValue)) continue;
    const topicId = topologyContractId("event-topic", options.repositoryId, options.path, channelName);
    const schemaId = topologyContractId("schema", options.repositoryId, options.path, channelName, "payload");
    nodes.push({
      id: topicId,
      kind: "event-topic",
      label: `${title}: ${channelName}`,
      repositoryId: options.repositoryId,
      confidence: "declared",
      freshness: "current",
      trustClass: "declared-context",
      sources: [source],
      limitations: [
        "Derived from a local AsyncAPI document without remote $ref resolution.",
        "Does not prove broker topology or consumer compatibility by itself."
      ],
      metadata: { asyncapiPath: options.path, channel: channelName }
    });
    nodes.push({
      id: schemaId,
      kind: "schema",
      label: `${channelName} payload schema`,
      repositoryId: options.repositoryId,
      confidence: "declared",
      freshness: "current",
      trustClass: "declared-context",
      sources: [source],
      limitations: ["Schema identity is local and inspectable; it is not a hosted schema registry entry."],
      metadata: { asyncapiPath: options.path, channel: channelName, kind: "payload" }
    });
    edges.push({
      id: topologyContractId("edge", topicId, "versioned-by", schemaId),
      from: topicId,
      to: schemaId,
      kind: "versioned-by",
      confidence: "declared",
      freshness: "current",
      trustClass: "declared-context",
      sources: [source],
      limitations: []
    });
    if (options.publisherServiceId || hasPublish(channelValue)) {
      const publisher = options.publisherServiceId ?? `service:${options.repositoryId}:publisher`;
      ensureServiceNode(nodes, publisher, options.repositoryId, source);
      edges.push({
        id: topologyContractId("edge", publisher, "publishes", topicId),
        from: publisher,
        to: topicId,
        kind: "publishes",
        confidence: "declared",
        freshness: "current",
        trustClass: "declared-context",
        sources: [source],
        limitations: []
      });
    }
    if (options.subscriberServiceId || hasSubscribe(channelValue)) {
      const subscriber = options.subscriberServiceId ?? `service:${options.repositoryId}:subscriber`;
      ensureServiceNode(nodes, subscriber, options.repositoryId, source);
      edges.push({
        id: topologyContractId("edge", subscriber, "subscribes", topicId),
        from: subscriber,
        to: topicId,
        kind: "subscribes",
        confidence: "declared",
        freshness: "current",
        trustClass: "declared-context",
        sources: [source],
        limitations: []
      });
    }
  }

  return {
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    generatedAt: observedAt,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    limitations: [
      "AsyncAPI adapter is local-only: no remote $ref fetch, network discovery, install, model, or telemetry calls."
    ]
  };
}

function ensureServiceNode(
  nodes: ServiceTopologyNode[],
  id: string,
  repositoryId: string,
  source: ServiceTopologySource
): void {
  if (nodes.some((node) => node.id === id)) return;
  nodes.push({
    id,
    kind: "service",
    label: id,
    repositoryId,
    confidence: "declared",
    freshness: "current",
    trustClass: "declared-context",
    sources: [source],
    limitations: ["Service node synthesized from AsyncAPI channel bindings; corroborate with the topology manifest."]
  });
}

function hasPublish(channel: Record<string, unknown>): boolean {
  return isRecord(channel.publish) || isRecord(channel.send);
}

function hasSubscribe(channel: Record<string, unknown>): boolean {
  return isRecord(channel.subscribe) || isRecord(channel.receive);
}

function assertNoRemoteRefs(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoRemoteRefs(entry, path);
    return;
  }
  if (!isRecord(value)) return;
  const ref = value.$ref;
  if (typeof ref === "string" && /^https?:\/\//i.test(ref)) {
    throw new Error(`AsyncAPI remote $ref is blocked for local-only topology parsing (${path}): ${ref}`);
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
