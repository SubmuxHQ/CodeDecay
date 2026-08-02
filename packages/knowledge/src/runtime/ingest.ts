import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ServiceTopologyGraph } from "../topology/types";
import {
  RUNTIME_EVIDENCE_SCHEMA_VERSION,
  type RuntimeErrorEvidence,
  type RuntimeEvidenceReport,
  type RuntimeEvidenceSource,
  type RuntimeEvidenceTrust,
  type RuntimeOperationEvidence
} from "./types";

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|api[-_]?key|request\.body|request_body|user\.email|client\.address/i;
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~+/-]+=*|\b(?:sk|ghp|github_pat)_[a-z0-9_-]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
const DEFAULT_MAX_SPANS = 5_000;
const DEFAULT_MAX_OPERATIONS = 200;
const DEFAULT_MAX_INPUT_BYTES = 10 * 1024 * 1024;

export interface IngestRuntimeEvidenceOptions {
  rootDir: string;
  otlpPath?: string | undefined;
  errorsPath?: string | undefined;
  headRevision?: string | undefined;
  environment?: string | undefined;
  topology?: ServiceTopologyGraph | undefined;
  maxSpans?: number | undefined;
  maxOperations?: number | undefined;
  maxInputBytes?: number | undefined;
  generatedAt?: string | undefined;
}

interface MutableStats {
  spansRead: number;
  spansDroppedByBounds: number;
  malformedRecords: number;
  redactedValues: number;
}

interface SpanRecord {
  service: string;
  operation: string;
  route?: string | undefined;
  environment?: string | undefined;
  revision?: string | undefined;
  latencyMs: number;
  error: boolean;
  sampled: boolean;
  sourceRef: string;
}

export function ingestRuntimeEvidence(options: IngestRuntimeEvidenceOptions): RuntimeEvidenceReport {
  const rootDir = realpathSync(options.rootDir);
  const stats: MutableStats = { spansRead: 0, spansDroppedByBounds: 0, malformedRecords: 0, redactedValues: 0 };
  const sources: RuntimeEvidenceSource[] = [];
  const limitations: string[] = [];
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const spans = options.otlpPath ? loadOtlp(rootDir, options.otlpPath, options.environment, options.maxSpans ?? DEFAULT_MAX_SPANS, maxInputBytes, stats, sources) : [];
  const errors = options.errorsPath ? loadErrors(rootDir, options.errorsPath, options.headRevision, options.environment, maxInputBytes, stats, sources) : [];
  if (!options.otlpPath) limitations.push("No local OpenTelemetry export was configured; runtime path exposure is unavailable.");
  if (!options.errorsPath) limitations.push("No structured error export was configured; deployment-correlated errors are unavailable.");
  const operations = aggregateOperations(spans, options.headRevision, options.topology, options.maxOperations ?? DEFAULT_MAX_OPERATIONS, stats);
  const investigationTasks = createTasks(operations, errors);
  if (stats.malformedRecords > 0) limitations.push(`${stats.malformedRecords} malformed runtime record(s) were ignored; the report may be incomplete.`);
  if (stats.spansDroppedByBounds > 0) limitations.push(`${stats.spansDroppedByBounds} runtime record(s) were omitted by cardinality bounds.`);

  return {
    tool: "CodeDecay",
    schemaVersion: RUNTIME_EVIDENCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    headRevision: options.headRevision,
    sources,
    operations,
    errors,
    investigationTasks,
    limitations,
    stats,
    safety: {
      networkCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      rawRequestBodiesPersisted: false,
      secretsPersisted: false
    }
  };
}

function loadOtlp(rootDir: string, path: string, environment: string | undefined, maxSpans: number, maxInputBytes: number, stats: MutableStats, sources: RuntimeEvidenceSource[]): SpanRecord[] {
  const sourcePath = resolveInput(rootDir, path);
  const value = parseLocalJson(sourcePath, maxInputBytes, stats);
  const resourceSpans = recordArray(value, "resourceSpans", stats);
  const records: SpanRecord[] = [];
  let sampled = false;
  for (const resourceItem of resourceSpans) {
    const resourceSpan = asRecord(resourceItem);
    if (!resourceSpan) { stats.malformedRecords += 1; continue; }
    const resourceAttributes = attributes(asRecord(resourceSpan.resource)?.attributes, stats);
    const service = stringAttribute(resourceAttributes, "service.name") ?? "unknown-service";
    const revision = stringAttribute(resourceAttributes, "service.version") ?? stringAttribute(resourceAttributes, "vcs.ref.head.revision");
    const spanEnvironment = stringAttribute(resourceAttributes, "deployment.environment.name") ?? environment;
    for (const scopeItem of recordArray(resourceSpan, "scopeSpans", stats)) {
      const scopeSpan = asRecord(scopeItem);
      if (!scopeSpan) { stats.malformedRecords += 1; continue; }
      for (const spanItem of recordArray(scopeSpan, "spans", stats)) {
        stats.spansRead += 1;
        if (records.length >= maxSpans) { stats.spansDroppedByBounds += 1; continue; }
        const span = asRecord(spanItem);
        if (!span || typeof span.name !== "string") { stats.malformedRecords += 1; continue; }
        const spanAttributes = attributes(span.attributes, stats);
        const spanFlags = numberValue(span.flags);
        const spanSampled = spanFlags !== undefined && (spanFlags & 1) === 1;
        sampled ||= spanSampled;
        records.push({
          service,
          operation: redactText(span.name, stats),
          route: stripQuery(stringAttribute(spanAttributes, "http.route") ?? stringAttribute(spanAttributes, "url.path")),
          environment: spanEnvironment,
          revision,
          latencyMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
          error: asRecord(span.status)?.code === 2 || Boolean(stringAttribute(spanAttributes, "error.type")),
          sampled: spanSampled,
          sourceRef: `${path}#span:${typeof span.spanId === "string" ? span.spanId : stats.spansRead}`
        });
      }
    }
  }
  sources.push({ kind: "otlp-json", path, environment, sampled, redacted: true, limitations: sampled ? ["Trace export is sampled and cannot prove absence of unobserved paths."] : [] });
  return records;
}

function loadErrors(rootDir: string, path: string, headRevision: string | undefined, environment: string | undefined, maxInputBytes: number, stats: MutableStats, sources: RuntimeEvidenceSource[]): RuntimeErrorEvidence[] {
  const value = parseLocalJson(resolveInput(rootDir, path), maxInputBytes, stats);
  const records = recordArray(value, "errors", stats);
  if (records.length > 500) stats.spansDroppedByBounds += records.length - 500;
  const errors = records.slice(0, 500).flatMap((item, index) => {
    const error = asRecord(item);
    if (!error || typeof error.service !== "string" || typeof error.message !== "string") { stats.malformedRecords += 1; return []; }
    const revision = optionalString(error.revision);
    const group = optionalString(error.group) ?? `error-${index + 1}`;
    return [{
      evidenceId: evidenceId(["error", path, group, revision ?? "unknown"]),
      group: redactText(group, stats),
      service: redactText(error.service, stats),
      operation: optionalString(error.operation) ? redactText(String(error.operation), stats) : undefined,
      message: redactText(error.message, stats),
      count: Math.max(1, Math.floor(numberValue(error.count) ?? 1)),
      environment: optionalString(error.environment) ?? environment,
      revision,
      firstSeen: validTimestamp(error.firstSeen),
      lastSeen: validTimestamp(error.lastSeen),
      trust: revisionTrust(revision, headRevision),
      sourceRef: `${path}#error:${index + 1}`,
      limitations: revision ? [] : ["Error export does not identify a deployment revision."]
    } satisfies RuntimeErrorEvidence];
  });
  sources.push({ kind: "structured-errors", path, environment, sampled: false, redacted: true, limitations: [] });
  return errors;
}

function aggregateOperations(spans: SpanRecord[], headRevision: string | undefined, topology: ServiceTopologyGraph | undefined, maxOperations: number, stats: MutableStats): RuntimeOperationEvidence[] {
  const groups = new Map<string, SpanRecord[]>();
  for (const span of spans) {
    const key = [span.service, span.operation, span.route ?? "", span.environment ?? "", span.revision ?? ""].join("\0");
    const existing = groups.get(key);
    if (existing) existing.push(span); else if (groups.size < maxOperations) groups.set(key, [span]); else stats.spansDroppedByBounds += 1;
  }
  return [...groups.values()].map((items) => {
    const first = items[0] as SpanRecord;
    const topologyNodeIds = correlateTopology(topology, first.service, first.route);
    const trust = revisionTrust(first.revision, headRevision);
    const totalLatency = items.reduce((sum, item) => sum + item.latencyMs, 0);
    return {
      evidenceId: evidenceId(["operation", first.service, first.operation, first.route ?? "", first.revision ?? "unknown"]),
      service: first.service,
      operation: first.operation,
      route: first.route,
      environment: first.environment,
      revision: first.revision,
      spanCount: items.length,
      errorCount: items.filter((item) => item.error).length,
      maxLatencyMs: Math.max(...items.map((item) => item.latencyMs)),
      averageLatencyMs: Math.round((totalLatency / items.length) * 100) / 100,
      sampled: items.some((item) => item.sampled),
      trust,
      topologyNodeIds,
      sourceRefs: items.slice(0, 20).map((item) => item.sourceRef),
      limitations: [
        ...(items.some((item) => item.sampled) ? ["Sampled traces cannot prove absence of failures."] : []),
        ...(trust !== "current-revision" ? ["Runtime evidence does not exactly match the current head revision."] : [])
      ]
    };
  }).sort((left, right) => right.errorCount - left.errorCount || right.maxLatencyMs - left.maxLatencyMs || left.evidenceId.localeCompare(right.evidenceId));
}

function correlateTopology(topology: ServiceTopologyGraph | undefined, service: string, route: string | undefined): string[] {
  if (!topology) return [];
  const normalizedService = service.toLowerCase();
  const normalizedRoute = route?.toLowerCase();
  return topology.nodes.filter((node) => {
    const metadataRoute = typeof node.metadata?.route === "string" ? node.metadata.route.toLowerCase() : undefined;
    return node.id.toLowerCase() === `service:${normalizedService}` || node.label.toLowerCase() === normalizedService || Boolean(normalizedRoute && metadataRoute === normalizedRoute);
  }).map((node) => node.id).sort();
}

function createTasks(operations: RuntimeOperationEvidence[], errors: RuntimeErrorEvidence[]): string[] {
  return [
    ...operations.filter((item) => item.errorCount > 0).map((item) => `Reproduce ${item.errorCount} observed error span(s) for ${item.service} ${item.route ?? item.operation} against the current tree.`),
    ...operations.filter((item) => item.maxLatencyMs >= 1_000).map((item) => `Verify the ${item.maxLatencyMs}ms runtime hotspot for ${item.service} ${item.route ?? item.operation} with a bounded local performance check.`),
    ...errors.map((item) => `Investigate runtime error group ${item.group} (${item.count} event(s)) for ${item.service}; do not treat the export as current-tree proof.`)
  ];
}

function resolveInput(rootDir: string, path: string): string {
  const lexical = resolve(rootDir, path);
  if (lexical !== rootDir && !lexical.startsWith(`${rootDir}/`)) throw new Error(`Runtime evidence path must stay inside repository: ${path}`);
  if (!existsSync(lexical)) throw new Error(`Runtime evidence file not found: ${path}`);
  const real = realpathSync(lexical);
  if (real !== rootDir && !real.startsWith(`${rootDir}/`)) throw new Error(`Runtime evidence path must stay inside repository: ${path}`);
  return real;
}

function parseLocalJson(path: string, maxInputBytes: number, stats: MutableStats): unknown {
  const size = statSync(path).size;
  if (size > maxInputBytes) throw new Error(`Runtime evidence file exceeds ${maxInputBytes} byte limit: ${path}`);
  try { return JSON.parse(readFileSync(path, "utf8")) as unknown; } catch { stats.malformedRecords += 1; return {}; }
}

function attributes(value: unknown, stats: MutableStats): Map<string, string | number | boolean> {
  const result = new Map<string, string | number | boolean>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const attribute = asRecord(item);
    if (!attribute || typeof attribute.key !== "string") { stats.malformedRecords += 1; continue; }
    if (SENSITIVE_KEY.test(attribute.key)) { stats.redactedValues += 1; result.set(attribute.key, "[REDACTED]"); continue; }
    const raw = asRecord(attribute.value);
    const scalar = raw?.stringValue ?? raw?.intValue ?? raw?.doubleValue ?? raw?.boolValue;
    if (["string", "number", "boolean"].includes(typeof scalar)) result.set(attribute.key, typeof scalar === "string" ? redactText(scalar, stats) : scalar as number | boolean);
  }
  return result;
}

function stringAttribute(values: Map<string, string | number | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" && value !== "[REDACTED]" ? value : undefined;
}

function redactText(value: string, stats: MutableStats): string {
  let redacted = stripQuery(value) ?? "";
  redacted = redacted.replace(SENSITIVE_VALUE, () => { stats.redactedValues += 1; return "[REDACTED]"; });
  return redacted.slice(0, 500);
}

function stripQuery(value: string | undefined): string | undefined {
  if (!value) return value;
  const queryIndex = value.indexOf("?");
  return queryIndex >= 0 ? value.slice(0, queryIndex) : value;
}

function revisionTrust(revision: string | undefined, headRevision: string | undefined): RuntimeEvidenceTrust {
  if (!revision || !headRevision) return revision ? "unmatched" : "inferred";
  return revision === headRevision ? "current-revision" : "historical";
}

function durationMs(start: unknown, end: unknown): number {
  try {
    const duration = Number(BigInt(String(end ?? 0)) - BigInt(String(start ?? 0))) / 1_000_000;
    return Number.isFinite(duration) && duration >= 0 ? Math.round(duration * 100) / 100 : 0;
  } catch { return 0; }
}

function recordArray(value: unknown, key: string, stats: MutableStats): unknown[] {
  const record = asRecord(value);
  const items = record?.[key];
  if (items === undefined) return [];
  if (!Array.isArray(items)) { stats.malformedRecords += 1; return []; }
  return items;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validTimestamp(value: unknown): string | undefined {
  const text = optionalString(value);
  return text && Number.isFinite(new Date(text).getTime()) ? text : undefined;
}

function evidenceId(parts: string[]): string {
  return `runtime:${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 20)}`;
}
