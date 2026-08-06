import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ServiceTopologyGraph, ServiceTopologyNode } from "../topology/types";
import {
  RUNTIME_EVIDENCE_SCHEMA_VERSION,
  type RuntimeDeploymentEvidence,
  type RuntimeErrorEvidence,
  type RuntimeEvidenceReport,
  type RuntimeEvidenceSource,
  type RuntimeEvidenceTrust,
  type RuntimeInvestigationTask,
  type RuntimeOperationEvidence,
  type RuntimeProviderConfig
} from "./types";

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|api[-_]?key|request\.body|request_body|user\.email|client\.address|ssn|phone/i;
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~+/-]+=*|\b(?:sk|ghp|github_pat)_[a-z0-9_-]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
const DEFAULT_MAX_SPANS = 5_000;
const DEFAULT_MAX_OPERATIONS = 200;
const DEFAULT_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const RUNTIME_EVIDENCE_ARTIFACT_PATH = ".codedecay/local/runtime-evidence.json";

export interface IngestRuntimeEvidenceOptions {
  rootDir: string;
  otlpPath?: string | undefined;
  errorsPath?: string | undefined;
  headRevision?: string | undefined;
  environment?: string | undefined;
  topology?: ServiceTopologyGraph | undefined;
  provider?: RuntimeProviderConfig | undefined;
  maxSpans?: number | undefined;
  maxOperations?: number | undefined;
  maxInputBytes?: number | undefined;
  generatedAt?: string | undefined;
  persist?: boolean | undefined;
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
  peerService?: string | undefined;
  latencyMs: number;
  error: boolean;
  sampled: boolean;
  sourceRef: string;
}

export function ingestRuntimeEvidence(options: IngestRuntimeEvidenceOptions): RuntimeEvidenceReport {
  const rootDir = realpathSync(options.rootDir);
  const provider = normalizeProvider(options.provider);
  const stats: MutableStats = { spansRead: 0, spansDroppedByBounds: 0, malformedRecords: 0, redactedValues: 0 };
  const sources: RuntimeEvidenceSource[] = [];
  const limitations: string[] = [
    "Runtime evidence is read-only local artifact ingestion by default; it never proves a head revision safe by itself."
  ];
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const spans = options.otlpPath
    ? loadOtlp(rootDir, options.otlpPath, options.environment, options.maxSpans ?? DEFAULT_MAX_SPANS, maxInputBytes, stats, sources)
    : [];
  const loadedErrors = options.errorsPath
    ? loadErrorsAndDeployments(rootDir, options.errorsPath, options.headRevision, options.environment, maxInputBytes, stats, sources)
    : { errors: [] as RuntimeErrorEvidence[], deployments: [] as RuntimeDeploymentEvidence[] };
  if (!options.otlpPath) {
    limitations.push("No local OpenTelemetry export was configured; runtime path exposure is unavailable.");
  }
  if (!options.errorsPath) {
    limitations.push("No structured error export was configured; deployment-correlated errors are unavailable.");
  }
  limitations.push("No remote observability provider is configured; zero network calls were made.");

  const operations = aggregateOperations(
    spans,
    options.headRevision,
    options.topology,
    options.maxOperations ?? DEFAULT_MAX_OPERATIONS,
    stats
  );
  const errors = annotateMatchingDeployments(loadedErrors.errors, loadedErrors.deployments);
  const investigationTasks = createTasks(operations, errors, loadedErrors.deployments);
  if (stats.malformedRecords > 0) {
    limitations.push(`${stats.malformedRecords} malformed runtime record(s) were ignored; the report may be incomplete.`);
  }
  if (stats.spansDroppedByBounds > 0) {
    limitations.push(`${stats.spansDroppedByBounds} runtime record(s) were omitted by cardinality bounds.`);
  }
  if (operations.every((item) => item.trust !== "current-revision") && operations.length > 0) {
    limitations.push("Only historical or unmatched runtime operations were ingested; they cannot prove the current tree.");
  }

  const report: RuntimeEvidenceReport = {
    tool: "CodeDecay",
    schemaVersion: RUNTIME_EVIDENCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    headRevision: options.headRevision,
    provider,
    sources,
    operations,
    errors,
    deployments: loadedErrors.deployments,
    investigationTasks,
    investigationTaskTitles: investigationTasks.map((task) => task.title),
    canProveCurrentTree: false,
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

  if (options.persist !== false) {
    persistRuntimeEvidenceArtifact(rootDir, report);
  }
  return report;
}

export function persistRuntimeEvidenceArtifact(rootDir: string, report: RuntimeEvidenceReport): string {
  const outputPath = resolve(rootDir, RUNTIME_EVIDENCE_ARTIFACT_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return RUNTIME_EVIDENCE_ARTIFACT_PATH;
}

function normalizeProvider(provider: RuntimeProviderConfig | undefined): RuntimeProviderConfig {
  if (!provider) {
    return { kind: "local-artifact" };
  }
  if (provider.kind !== "local-artifact") {
    throw new Error(`Unsupported runtime provider kind "${String((provider as { kind?: string }).kind)}". Only local-artifact is enabled.`);
  }
  return {
    kind: "local-artifact",
    endpointOrFile: provider.endpointOrFile,
    environmentAllowlist: provider.environmentAllowlist,
    queryBudgetMs: provider.queryBudgetMs,
    secretEnvNames: provider.secretEnvNames ?? []
  };
}

function loadOtlp(
  rootDir: string,
  path: string,
  environment: string | undefined,
  maxSpans: number,
  maxInputBytes: number,
  stats: MutableStats,
  sources: RuntimeEvidenceSource[]
): SpanRecord[] {
  const sourcePath = resolveInput(rootDir, path);
  const value = parseLocalJson(sourcePath, maxInputBytes, stats);
  const resourceSpans = recordArray(value, "resourceSpans", stats);
  const records: SpanRecord[] = [];
  let sampled = false;
  let collectionStart: string | undefined;
  let collectionEnd: string | undefined;
  for (const resourceItem of resourceSpans) {
    const resourceSpan = asRecord(resourceItem);
    if (!resourceSpan) {
      stats.malformedRecords += 1;
      continue;
    }
    const resourceAttributes = attributes(asRecord(resourceSpan.resource)?.attributes, stats);
    const service = stringAttribute(resourceAttributes, "service.name") ?? "unknown-service";
    const revision =
      stringAttribute(resourceAttributes, "service.version") ??
      stringAttribute(resourceAttributes, "vcs.ref.head.revision");
    const spanEnvironment = stringAttribute(resourceAttributes, "deployment.environment.name") ?? environment;
    for (const scopeItem of recordArray(resourceSpan, "scopeSpans", stats)) {
      const scopeSpan = asRecord(scopeItem);
      if (!scopeSpan) {
        stats.malformedRecords += 1;
        continue;
      }
      for (const spanItem of recordArray(scopeSpan, "spans", stats)) {
        stats.spansRead += 1;
        if (records.length >= maxSpans) {
          stats.spansDroppedByBounds += 1;
          continue;
        }
        const span = asRecord(spanItem);
        if (!span || typeof span.name !== "string") {
          stats.malformedRecords += 1;
          continue;
        }
        const spanAttributes = attributes(span.attributes, stats);
        const spanFlags = numberValue(span.flags);
        const spanSampled = spanFlags !== undefined && (spanFlags & 1) === 1;
        sampled ||= spanSampled;
        const startMs = unixNanoToIso(span.startTimeUnixNano);
        const endMs = unixNanoToIso(span.endTimeUnixNano);
        if (startMs && (!collectionStart || startMs < collectionStart)) collectionStart = startMs;
        if (endMs && (!collectionEnd || endMs > collectionEnd)) collectionEnd = endMs;
        records.push({
          service,
          operation: redactText(span.name, stats),
          route: stripQuery(stringAttribute(spanAttributes, "http.route") ?? stringAttribute(spanAttributes, "url.path")),
          environment: spanEnvironment,
          revision,
          peerService: stringAttribute(spanAttributes, "peer.service") ?? stringAttribute(spanAttributes, "net.peer.name"),
          latencyMs: durationMs(span.startTimeUnixNano, span.endTimeUnixNano),
          error: asRecord(span.status)?.code === 2 || Boolean(stringAttribute(spanAttributes, "error.type")),
          sampled: spanSampled,
          sourceRef: `${path}#span:${typeof span.spanId === "string" ? span.spanId : stats.spansRead}`
        });
      }
    }
  }
  sources.push({
    kind: "otlp-json",
    path,
    environment,
    collectionStart,
    collectionEnd,
    sampled,
    redacted: true,
    limitations: sampled ? ["Trace export is sampled and cannot prove absence of unobserved paths."] : []
  });
  return records;
}

function loadErrorsAndDeployments(
  rootDir: string,
  path: string,
  headRevision: string | undefined,
  environment: string | undefined,
  maxInputBytes: number,
  stats: MutableStats,
  sources: RuntimeEvidenceSource[]
): { errors: RuntimeErrorEvidence[]; deployments: RuntimeDeploymentEvidence[] } {
  const value = parseLocalJson(resolveInput(rootDir, path), maxInputBytes, stats);
  const records = recordArray(value, "errors", stats);
  const deploymentRecords = recordArray(value, "deployments", stats);
  if (records.length > 500) stats.spansDroppedByBounds += records.length - 500;
  if (deploymentRecords.length > 100) stats.spansDroppedByBounds += deploymentRecords.length - 100;

  const errors = records.slice(0, 500).flatMap((item, index) => {
    const error = asRecord(item);
    if (!error || typeof error.service !== "string" || typeof error.message !== "string") {
      stats.malformedRecords += 1;
      return [];
    }
    const revision = optionalString(error.revision);
    const trust = revisionTrust(revision, headRevision);
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
      trust,
      provesCurrentTree: false as const,
      sourceRef: `${path}#error:${index + 1}`,
      limitations: [
        ...(revision ? [] : ["Error export does not identify a deployment revision."]),
        ...(trust !== "current-revision" ? ["Historical or unmatched errors cannot prove the current tree."] : [])
      ]
    } satisfies RuntimeErrorEvidence];
  });

  const deployments = deploymentRecords.slice(0, 100).flatMap((item, index) => {
    const deployment = asRecord(item);
    if (!deployment || typeof deployment.service !== "string" || typeof deployment.revision !== "string") {
      stats.malformedRecords += 1;
      return [];
    }
    const trust = revisionTrust(deployment.revision, headRevision);
    return [{
      evidenceId: evidenceId(["deployment", path, deployment.service, deployment.revision]),
      service: redactText(deployment.service, stats),
      revision: deployment.revision,
      environment: optionalString(deployment.environment) ?? environment,
      deployedAt: validTimestamp(deployment.deployedAt),
      trust,
      sourceRef: `${path}#deployment:${index + 1}`,
      limitations: trust !== "current-revision"
        ? ["Deployment event does not match the current head revision."]
        : []
    } satisfies RuntimeDeploymentEvidence];
  });

  sources.push({ kind: "structured-errors", path, environment, sampled: false, redacted: true, limitations: [] });
  if (deployments.length > 0) {
    sources.push({
      kind: "deployment-events",
      path,
      environment,
      sampled: false,
      redacted: true,
      limitations: ["Deployment events are untrusted context until corroborated against the current tree."]
    });
  }
  return { errors, deployments };
}

function annotateMatchingDeployments(
  errors: RuntimeErrorEvidence[],
  deployments: RuntimeDeploymentEvidence[]
): RuntimeErrorEvidence[] {
  return errors.map((error) => {
    const match = deployments.find(
      (deployment) =>
        deployment.service === error.service &&
        Boolean(error.revision) &&
        deployment.revision === error.revision
    );
    return match ? { ...error, matchingDeploymentId: match.evidenceId } : error;
  });
}

function aggregateOperations(
  spans: SpanRecord[],
  headRevision: string | undefined,
  topology: ServiceTopologyGraph | undefined,
  maxOperations: number,
  stats: MutableStats
): RuntimeOperationEvidence[] {
  const groups = new Map<string, SpanRecord[]>();
  for (const span of spans) {
    const key = [span.service, span.operation, span.route ?? "", span.environment ?? "", span.revision ?? ""].join("\0");
    const existing = groups.get(key);
    if (existing) existing.push(span);
    else if (groups.size < maxOperations) groups.set(key, [span]);
    else stats.spansDroppedByBounds += 1;
  }
  return [...groups.values()].map((items) => {
    const first = items[0] as SpanRecord;
    const correlation = correlateTopology(topology, first.service, first.route, first.peerService);
    const trust = revisionTrust(first.revision, headRevision);
    const totalLatency = items.reduce((sum, item) => sum + item.latencyMs, 0);
    const maxLatencyMs = Math.max(...items.map((item) => item.latencyMs));
    const latencyBudgetMs = correlation.latencyBudgetMs;
    const budgetBreached = latencyBudgetMs !== undefined && maxLatencyMs > latencyBudgetMs;
    return {
      evidenceId: evidenceId(["operation", first.service, first.operation, first.route ?? "", first.revision ?? "unknown"]),
      service: first.service,
      operation: first.operation,
      route: first.route,
      environment: first.environment,
      revision: first.revision,
      spanCount: items.length,
      errorCount: items.filter((item) => item.error).length,
      maxLatencyMs,
      averageLatencyMs: Math.round((totalLatency / items.length) * 100) / 100,
      latencyBudgetMs,
      budgetBreached,
      sampled: items.some((item) => item.sampled),
      trust,
      provesCurrentTree: false as const,
      topologyNodeIds: correlation.topologyNodeIds,
      downstreamServiceIds: correlation.downstreamServiceIds,
      sourceRefs: items.slice(0, 20).map((item) => item.sourceRef),
      limitations: [
        ...(items.some((item) => item.sampled) ? ["Sampled traces cannot prove absence of failures."] : []),
        ...(trust !== "current-revision" ? ["Runtime evidence does not exactly match the current head revision and cannot prove the current tree."] : []),
        ...(budgetBreached ? [`Observed max latency ${maxLatencyMs}ms exceeds declared budget ${latencyBudgetMs}ms.`] : [])
      ]
    };
  }).sort((left, right) => right.errorCount - left.errorCount || right.maxLatencyMs - left.maxLatencyMs || left.evidenceId.localeCompare(right.evidenceId));
}

function correlateTopology(
  topology: ServiceTopologyGraph | undefined,
  service: string,
  route: string | undefined,
  peerService: string | undefined
): { topologyNodeIds: string[]; downstreamServiceIds: string[]; latencyBudgetMs?: number | undefined } {
  if (!topology) {
    return {
      topologyNodeIds: [],
      downstreamServiceIds: peerService ? [`service:${peerService}`] : []
    };
  }
  const normalizedService = service.toLowerCase();
  const normalizedRoute = route?.toLowerCase();
  const matched = topology.nodes.filter((node) => {
    const metadataRoute = typeof node.metadata?.route === "string" ? node.metadata.route.toLowerCase() : undefined;
    return (
      node.id.toLowerCase() === `service:${normalizedService}` ||
      node.label.toLowerCase() === normalizedService ||
      Boolean(normalizedRoute && metadataRoute === normalizedRoute)
    );
  });
  const topologyNodeIds = matched.map((node) => node.id).sort();
  const matchedIds = new Set(topologyNodeIds);
  const downstream = new Set<string>();
  if (peerService) downstream.add(`service:${peerService}`);
  for (const edge of topology.edges) {
    if (!matchedIds.has(edge.from)) continue;
    if (edge.kind !== "calls" && edge.kind !== "consumes") continue;
    const target = topology.nodes.find((node) => node.id === edge.to);
    if (target && (target.kind === "service" || target.kind === "api" || target.kind === "deployment-unit")) {
      downstream.add(target.id);
    }
  }
  const latencyBudgetMs = firstLatencyBudget(matched);
  return {
    topologyNodeIds,
    downstreamServiceIds: [...downstream].sort(),
    latencyBudgetMs
  };
}

function firstLatencyBudget(nodes: ServiceTopologyNode[]): number | undefined {
  for (const node of nodes) {
    const value = node.metadata?.latencyBudgetMs;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function createTasks(
  operations: RuntimeOperationEvidence[],
  errors: RuntimeErrorEvidence[],
  deployments: RuntimeDeploymentEvidence[]
): RuntimeInvestigationTask[] {
  const tasks: RuntimeInvestigationTask[] = [];
  for (const item of operations.filter((entry) => entry.errorCount > 0)) {
    tasks.push({
      evidenceId: evidenceId(["task", "error-spans", item.evidenceId]),
      title: `Reproduce ${item.errorCount} observed error span(s) for ${item.service} ${item.route ?? item.operation}`,
      detail: `Use trusted local execution against the current tree. Cited runtime evidence: ${item.evidenceId}. Downstream: ${item.downstreamServiceIds.join(", ") || "none declared"}.`,
      citedEvidenceIds: [item.evidenceId],
      priority: "high",
      provesCurrentTree: false
    });
  }
  for (const item of operations.filter((entry) => entry.budgetBreached || entry.maxLatencyMs >= 1_000)) {
    const budgetText = item.latencyBudgetMs
      ? `budget ${item.latencyBudgetMs}ms (observed max ${item.maxLatencyMs}ms)`
      : `${item.maxLatencyMs}ms hotspot`;
    tasks.push({
      evidenceId: evidenceId(["task", "latency", item.evidenceId]),
      title: `Verify latency ${budgetText} for ${item.service} ${item.route ?? item.operation}`,
      detail: `Run a bounded local performance check. Downstream services: ${item.downstreamServiceIds.join(", ") || "none declared"}. Cited: ${item.evidenceId}.`,
      citedEvidenceIds: [item.evidenceId, ...item.downstreamServiceIds.map((id) => evidenceId(["topology", id]))],
      priority: item.budgetBreached ? "high" : "medium",
      provesCurrentTree: false
    });
  }
  for (const item of errors) {
    const cited = [item.evidenceId, ...(item.matchingDeploymentId ? [item.matchingDeploymentId] : [])];
    const deployment = deployments.find((entry) => entry.evidenceId === item.matchingDeploymentId);
    tasks.push({
      evidenceId: evidenceId(["task", "error-group", item.evidenceId]),
      title: `Investigate runtime error group ${item.group} for ${item.service}`,
      detail: deployment
        ? `Matching deployment ${deployment.evidenceId} at revision ${deployment.revision} correlates with this error export. Do not treat the export as current-tree proof. Cited: ${cited.join(", ")}.`
        : `Do not treat the export as current-tree proof. Cited: ${item.evidenceId}.`,
      citedEvidenceIds: cited,
      priority: item.matchingDeploymentId ? "high" : "medium",
      provesCurrentTree: false
    });
  }
  return uniqueBy(tasks, (task) => task.evidenceId).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function resolveInput(rootDir: string, path: string): string {
  const lexical = resolve(rootDir, path);
  if (lexical !== rootDir && !lexical.startsWith(`${rootDir}/`)) {
    throw new Error(`Runtime evidence path must stay inside repository: ${path}`);
  }
  if (!existsSync(lexical)) throw new Error(`Runtime evidence file not found: ${path}`);
  const real = realpathSync(lexical);
  if (real !== rootDir && !real.startsWith(`${rootDir}/`)) {
    throw new Error(`Runtime evidence path must stay inside repository: ${path}`);
  }
  return real;
}

function parseLocalJson(path: string, maxInputBytes: number, stats: MutableStats): unknown {
  const size = statSync(path).size;
  if (size > maxInputBytes) throw new Error(`Runtime evidence file exceeds ${maxInputBytes} byte limit: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    stats.malformedRecords += 1;
    return {};
  }
}

function attributes(value: unknown, stats: MutableStats): Map<string, string | number | boolean> {
  const result = new Map<string, string | number | boolean>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const attribute = asRecord(item);
    if (!attribute || typeof attribute.key !== "string") {
      stats.malformedRecords += 1;
      continue;
    }
    if (SENSITIVE_KEY.test(attribute.key)) {
      stats.redactedValues += 1;
      result.set(attribute.key, "[REDACTED]");
      continue;
    }
    const raw = asRecord(attribute.value);
    const scalar = raw?.stringValue ?? raw?.intValue ?? raw?.doubleValue ?? raw?.boolValue;
    if (["string", "number", "boolean"].includes(typeof scalar)) {
      result.set(attribute.key, typeof scalar === "string" ? redactText(scalar, stats) : scalar as number | boolean);
    }
  }
  return result;
}

function stringAttribute(values: Map<string, string | number | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" && value !== "[REDACTED]" ? value : undefined;
}

function redactText(value: string, stats: MutableStats): string {
  let redacted = stripQuery(value) ?? "";
  redacted = redacted.replace(SENSITIVE_VALUE, () => {
    stats.redactedValues += 1;
    return "[REDACTED]";
  });
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
  } catch {
    return 0;
  }
}

function unixNanoToIso(value: unknown): string | undefined {
  try {
    const nanos = BigInt(String(value ?? ""));
    const ms = Number(nanos / 1_000_000n);
    if (!Number.isFinite(ms) || ms <= 0) return undefined;
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

function recordArray(value: unknown, key: string, stats: MutableStats): unknown[] {
  const record = asRecord(value);
  const items = record?.[key];
  if (items === undefined) return [];
  if (!Array.isArray(items)) {
    stats.malformedRecords += 1;
    return [];
  }
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

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
