import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  SERVICE_TOPOLOGY_EDGE_KINDS,
  SERVICE_TOPOLOGY_NODE_KINDS,
  SERVICE_TOPOLOGY_SCHEMA_VERSION,
  type ServiceTopologyEdge,
  type ServiceTopologyGraph,
  type ServiceTopologyNode,
  type ServiceTopologySource
} from "./types";

export const SERVICE_TOPOLOGY_ARTIFACT_PATH = ".codedecay/local/service-topology.json";

export interface LoadServiceTopologyOptions {
  rootDir: string;
  path: string;
  now?: Date | undefined;
  staleAfterDays?: number | undefined;
}

export function loadServiceTopologyManifest(options: LoadServiceTopologyOptions): ServiceTopologyGraph {
  const rootDir = realpathSync(options.rootDir);
  const manifestPath = resolveReadableInside(rootDir, options.path);
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error(`Topology manifest not found inside repository: ${options.path}`);
  }
  const raw = readFileSync(manifestPath, "utf8");
  const parsed = options.path.endsWith(".json") ? JSON.parse(raw) as unknown : parseYaml(raw) as unknown;
  return normalizeServiceTopologyGraph(parsed, {
    manifestPath,
    now: options.now ?? new Date(),
    staleAfterDays: options.staleAfterDays ?? 30
  });
}

export function persistServiceTopologyArtifact(
  rootDir: string,
  graph: ServiceTopologyGraph,
  artifactPath = SERVICE_TOPOLOGY_ARTIFACT_PATH
): string {
  const resolvedRoot = realpathSync(rootDir);
  const outputPath = resolveWritableInside(resolvedRoot, artifactPath);
  if (!outputPath) throw new Error(`Topology artifact path must stay inside repository: ${artifactPath}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return artifactPath;
}

export function normalizeServiceTopologyGraph(
  value: unknown,
  options: { manifestPath?: string | undefined; now?: Date | undefined; staleAfterDays?: number | undefined } = {}
): ServiceTopologyGraph {
  const input = record(value, "topology manifest");
  if (input.schemaVersion !== SERVICE_TOPOLOGY_SCHEMA_VERSION) {
    throw new Error(`Unsupported topology schemaVersion: ${String(input.schemaVersion)}`);
  }
  const now = options.now ?? new Date();
  const staleAfterMs = (options.staleAfterDays ?? 30) * 86_400_000;
  const nodes = array(input.nodes, "nodes").map((node, index) => normalizeNode(node, index, options.manifestPath, now, staleAfterMs));
  const edges = array(input.edges, "edges").map((edge, index) => normalizeEdge(edge, index, options.manifestPath, now, staleAfterMs));
  assertUnique(nodes.map((node) => node.id), "node");
  assertUnique(edges.map((edge) => edge.id), "edge");
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`Topology edge ${edge.id} references a missing node.`);
    }
  }
  return {
    schemaVersion: SERVICE_TOPOLOGY_SCHEMA_VERSION,
    generatedAt: optionalString(input.generatedAt),
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    limitations: stringArray(input.limitations, "limitations")
  };
}

function normalizeNode(value: unknown, index: number, manifestPath: string | undefined, now: Date, staleAfterMs: number): ServiceTopologyNode {
  const input = record(value, `nodes[${index}]`);
  const kind = enumValue(input.kind, SERVICE_TOPOLOGY_NODE_KINDS, `nodes[${index}].kind`);
  const sources = normalizeSources(input.sources, `nodes[${index}].sources`, manifestPath);
  const freshness = normalizeFreshness(input.freshness, sources, now, staleAfterMs);
  const repositoryRoot = normalizeRepositoryRoot(input.repositoryRoot, manifestPath);
  return {
    id: requiredString(input.id, `nodes[${index}].id`),
    kind,
    label: requiredString(input.label, `nodes[${index}].label`),
    repositoryId: optionalString(input.repositoryId),
    repositoryRoot,
    available: typeof input.available === "boolean" ? input.available : repositoryRoot ? existsSync(repositoryRoot) : undefined,
    confidence: confidence(input.confidence, `nodes[${index}].confidence`),
    freshness,
    trustClass: trustClass(input.trustClass, freshness, `nodes[${index}].trustClass`),
    sources,
    limitations: stringArray(input.limitations, `nodes[${index}].limitations`),
    metadata: isRecord(input.metadata) ? input.metadata : undefined
  };
}

function normalizeEdge(value: unknown, index: number, manifestPath: string | undefined, now: Date, staleAfterMs: number): ServiceTopologyEdge {
  const input = record(value, `edges[${index}]`);
  const sources = normalizeSources(input.sources, `edges[${index}].sources`, manifestPath);
  const freshness = normalizeFreshness(input.freshness, sources, now, staleAfterMs);
  return {
    id: requiredString(input.id, `edges[${index}].id`),
    from: requiredString(input.from, `edges[${index}].from`),
    to: requiredString(input.to, `edges[${index}].to`),
    kind: enumValue(input.kind, SERVICE_TOPOLOGY_EDGE_KINDS, `edges[${index}].kind`),
    confidence: confidence(input.confidence, `edges[${index}].confidence`),
    freshness,
    trustClass: trustClass(input.trustClass, freshness, `edges[${index}].trustClass`),
    sources,
    limitations: stringArray(input.limitations, `edges[${index}].limitations`)
  };
}

function normalizeSources(value: unknown, label: string, manifestPath: string | undefined): ServiceTopologySource[] {
  const values = array(value, label);
  if (values.length === 0) throw new Error(`${label} must include at least one source.`);
  return values.map((source, index) => {
    const input = record(source, `${label}[${index}]`);
    return {
      kind: enumValue(input.kind, ["manifest", "openapi", "asyncapi", "protobuf", "package-manager", "service-catalog", "local-graph"] as const, `${label}[${index}].kind`),
      source: requiredString(input.source, `${label}[${index}].source`) || manifestPath || "manifest",
      repositoryId: requiredString(input.repositoryId, `${label}[${index}].repositoryId`),
      revision: requiredString(input.revision, `${label}[${index}].revision`),
      observedAt: optionalString(input.observedAt)
    };
  });
}

function normalizeFreshness(value: unknown, sources: ServiceTopologySource[], now: Date, staleAfterMs: number): "current" | "stale" | "unknown" {
  if (value === "stale" || value === "unknown") return value;
  if (value !== "current") throw new Error(`Invalid topology freshness: ${String(value)}`);
  const observations = sources.map((source) => source.observedAt).filter((item): item is string => Boolean(item));
  if (observations.length === 0) return "unknown";
  const timestamps = observations.map((item) => new Date(item).getTime());
  if (timestamps.some((timestamp) => !Number.isFinite(timestamp))) return "unknown";
  return timestamps.some((timestamp) => now.getTime() - timestamp > staleAfterMs) ? "stale" : "current";
}

function trustClass(value: unknown, freshness: "current" | "stale" | "unknown", label: string): ServiceTopologyNode["trustClass"] {
  const normalized = enumValue(value, ["current-revision-fact", "declared-context", "untrusted-inference", "stale-context"] as const, label);
  return freshness === "current" ? normalized : "stale-context";
}

function confidence(value: unknown, label: string): ServiceTopologyNode["confidence"] {
  return enumValue(value, ["verified", "declared", "inferred"] as const, label);
}

function normalizeRepositoryRoot(value: unknown, manifestPath: string | undefined): string | undefined {
  const root = optionalString(value);
  if (!root) return undefined;
  if (isAbsolute(root)) return realpathIfAvailable(root);
  return manifestPath ? realpathIfAvailable(resolve(dirname(manifestPath), root)) : root;
}

function resolveInside(rootDir: string, path: string): string | undefined {
  const resolved = resolve(rootDir, path);
  return resolved === rootDir || resolved.startsWith(`${rootDir}/`) ? resolved : undefined;
}

function resolveReadableInside(rootDir: string, path: string): string | undefined {
  const lexicalPath = resolveInside(rootDir, path);
  if (!lexicalPath || !existsSync(lexicalPath)) return undefined;
  const realPath = realpathSync(lexicalPath);
  return resolveInside(rootDir, realPath);
}

function resolveWritableInside(rootDir: string, path: string): string | undefined {
  const outputPath = resolveInside(rootDir, path);
  if (!outputPath) return undefined;
  let existingParent = dirname(outputPath);
  while (!existsSync(existingParent) && existingParent !== dirname(existingParent)) existingParent = dirname(existingParent);
  const realParent = realpathSync(existingParent);
  return resolveInside(rootDir, realParent) ? outputPath : undefined;
}

function realpathIfAvailable(path: string): string {
  try { return realpathSync(path); } catch { return path; }
}

function assertUnique(ids: string[], kind: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate topology ${kind} id: ${id}`);
    seen.add(id);
  }
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid ${label}: ${String(value)}`);
  return value as T[number];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown, label: string): string[] {
  return array(value ?? [], label).map((item, index) => requiredString(item, `${label}[${index}]`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function topologyEvidenceId(parts: string[]): string {
  return `topology:${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 20)}`;
}
