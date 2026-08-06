import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestRuntimeEvidence, normalizeServiceTopologyGraph } from "../src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT runtime evidence (#685)", () => {
  it("UAT-RUNTIME-1: OTEL fixture maps changed route to downstream service and latency budget", () => {
    const root = tempRoot();
    writeJson(join(root, "traces.json"), otlp([
      span("GET /checkout", "route-1", 0, {
        "http.route": "/checkout",
        "peer.service": "payments"
      }, "0", "2500000000")
    ], "api", "head"));
    const topology = normalizeServiceTopologyGraph({
      schemaVersion: 1,
      nodes: [
        node("service:api", "service", "api", { route: "/checkout", latencyBudgetMs: 500 }),
        node("service:payments", "service", "payments")
      ],
      edges: [
        edge("edge:api-calls-payments", "service:api", "service:payments", "calls")
      ],
      limitations: []
    });

    const report = ingestRuntimeEvidence({
      rootDir: root,
      otlpPath: "traces.json",
      headRevision: "head",
      topology,
      persist: false,
      generatedAt: "2026-08-06T00:00:00.000Z"
    });

    expect(report.operations[0]).toMatchObject({
      route: "/checkout",
      topologyNodeIds: ["service:api"],
      downstreamServiceIds: expect.arrayContaining(["service:payments"]),
      latencyBudgetMs: 500,
      budgetBreached: true,
      provesCurrentTree: false
    });
    expect(report.investigationTasks.some((task) => task.title.includes("latency") && task.citedEvidenceIds.includes(report.operations[0]!.evidenceId))).toBe(true);
  });

  it("UAT-RUNTIME-2: matching deployment/error fixture raises a cited investigation task", () => {
    const root = tempRoot();
    writeJson(join(root, "errors.json"), {
      deployments: [{ service: "api", revision: "head", deployedAt: "2026-08-06T00:00:00.000Z" }],
      errors: [{ service: "api", group: "checkout-timeout", message: "upstream timeout", revision: "head", count: 4 }]
    });

    const report = ingestRuntimeEvidence({
      rootDir: root,
      errorsPath: "errors.json",
      headRevision: "head",
      persist: false
    });

    expect(report.errors[0]?.matchingDeploymentId).toBe(report.deployments[0]?.evidenceId);
    const task = report.investigationTasks.find((item) => item.title.includes("checkout-timeout"));
    expect(task?.citedEvidenceIds).toEqual(expect.arrayContaining([
      report.errors[0]!.evidenceId,
      report.deployments[0]!.evidenceId
    ]));
    expect(task?.provesCurrentTree).toBe(false);
  });

  it("UAT-RUNTIME-3: old revision telemetry is historical and cannot prove the current tree", () => {
    const root = tempRoot();
    writeJson(join(root, "traces.json"), otlp([span("GET /users", "1", 0, { "http.route": "/users" })], "api", "old"));
    const report = ingestRuntimeEvidence({
      rootDir: root,
      otlpPath: "traces.json",
      headRevision: "head",
      persist: false
    });

    expect(report.operations[0]).toMatchObject({ trust: "historical", provesCurrentTree: false });
    expect(report.canProveCurrentTree).toBe(false);
    expect(report.limitations.join(" ")).toMatch(/cannot prove the current tree/i);
  });

  it("UAT-RUNTIME-4: PII and secrets are absent from reports and persisted artifacts", () => {
    const root = tempRoot();
    writeJson(join(root, "traces.json"), otlp([
      span("GET /users?token=secret", "route-1", 1, {
        "http.route": "/users?authorization=Bearer abc.def",
        "user.email": "person@example.com",
        "error.type": "timeout"
      })
    ], "api", "head"));
    writeJson(join(root, "errors.json"), {
      errors: [{ service: "api", group: "users?token=secret", message: "failed for person@example.com with ghp_abcdefghijklmnopqrstuvwxyz", revision: "old", count: 3 }]
    });

    const report = ingestRuntimeEvidence({
      rootDir: root,
      otlpPath: "traces.json",
      errorsPath: "errors.json",
      headRevision: "head"
    });
    const serialized = JSON.stringify(report);
    const artifact = JSON.parse(readFileSync(join(root, ".codedecay/local/runtime-evidence.json"), "utf8")) as unknown;

    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("Bearer abc.def");
    expect(JSON.stringify(artifact)).not.toContain("person@example.com");
    expect(report.safety.secretsPersisted).toBe(false);
  });

  it("UAT-RUNTIME-5: no configured provider means zero network calls and a clear limitation", () => {
    const report = ingestRuntimeEvidence({ rootDir: tempRoot(), persist: false, generatedAt: "2026-08-06T00:00:00.000Z" });
    expect(report.provider.kind).toBe("local-artifact");
    expect(report.safety.networkCalled).toBe(false);
    expect(report.limitations.join(" ")).toMatch(/zero network calls/i);
    expect(report.limitations.join(" ")).toMatch(/No local OpenTelemetry export/i);
  });

  it("UAT-RUNTIME-6: malformed or partial export does not crash and keeps coverage limitations", () => {
    const root = tempRoot();
    writeJson(join(root, "traces.json"), otlp([
      span("one", "1", 0),
      { spanId: "bad" }
    ], "api", "head"));
    writeFileSync(join(root, "errors.json"), "{not json", "utf8");

    const report = ingestRuntimeEvidence({
      rootDir: root,
      otlpPath: "traces.json",
      errorsPath: "errors.json",
      headRevision: "head",
      maxSpans: 10,
      persist: false
    });

    expect(report.operations.length).toBeGreaterThanOrEqual(1);
    expect(report.errors).toEqual([]);
    expect(report.stats.malformedRecords).toBeGreaterThan(0);
    expect(report.limitations.join(" ")).toMatch(/malformed runtime record/i);
  });
});

describe("runtime evidence ingestion", () => {
  it("correlates current-revision traces while redacting sensitive data", () => {
    const root = tempRoot();
    writeJson(join(root, "traces.json"), otlp([
      span("GET /users?token=secret", "route-1", 1, {
        "http.route": "/users?authorization=Bearer abc.def",
        "user.email": "person@example.com",
        "error.type": "timeout"
      })
    ], "api", "head-sha"));
    writeJson(join(root, "errors.json"), {
      errors: [{ service: "api", group: "users?token=secret", message: "failed for person@example.com with ghp_abcdefghijklmnopqrstuvwxyz", revision: "old-sha", count: 3 }]
    });
    const topology = normalizeServiceTopologyGraph({
      schemaVersion: 1,
      nodes: [{ id: "service:api", kind: "service", label: "api", confidence: "declared", freshness: "unknown", trustClass: "declared-context", sources: [{ kind: "manifest", source: "fixture", repositoryId: "repo", revision: "head-sha" }], limitations: [] }],
      edges: [],
      limitations: []
    });

    const report = ingestRuntimeEvidence({ rootDir: root, otlpPath: "traces.json", errorsPath: "errors.json", headRevision: "head-sha", topology, generatedAt: "2026-08-02T00:00:00.000Z", persist: false });
    const serialized = JSON.stringify(report);

    expect(report.operations[0]).toMatchObject({ route: "/users", spanCount: 1, errorCount: 1, sampled: true, trust: "current-revision", topologyNodeIds: ["service:api"] });
    expect(report.errors[0]).toMatchObject({ group: "users", count: 3, trust: "historical" });
    expect(report.stats.redactedValues).toBeGreaterThanOrEqual(2);
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(serialized).not.toContain("Bearer abc.def");
    expect(report.safety).toEqual({ networkCalled: false, commandsExecuted: false, telemetrySent: false, rawRequestBodiesPersisted: false, secretsPersisted: false });
  });

  it("bounds high-cardinality input and degrades on malformed records", () => {
    const root = tempRoot();
    writeJson(join(root, "traces.json"), otlp([
      span("one", "1", 0),
      span("two", "2", 0),
      { spanId: "bad" }
    ], "api", "head"));
    writeFileSync(join(root, "errors.json"), "{not json", "utf8");

    const report = ingestRuntimeEvidence({ rootDir: root, otlpPath: "traces.json", errorsPath: "errors.json", headRevision: "head", maxSpans: 1, persist: false });

    expect(report.operations).toHaveLength(1);
    expect(report.operations[0]?.sampled).toBe(false);
    expect(report.stats).toMatchObject({ spansRead: 3, spansDroppedByBounds: 2, malformedRecords: 1 });
    expect(report.errors).toEqual([]);
    expect(report.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining("malformed runtime record"),
      expect.stringContaining("omitted by cardinality bounds")
    ]));
  });

  it("rejects oversized and symlinked evidence outside the repository", () => {
    const root = tempRoot();
    const outside = tempRoot();
    writeFileSync(join(root, "large.json"), "12345", "utf8");
    writeJson(join(outside, "trace.json"), otlp([], "api", "head"));
    symlinkSync(join(outside, "trace.json"), join(root, "linked.json"));

    expect(() => ingestRuntimeEvidence({ rootDir: root, otlpPath: "large.json", maxInputBytes: 4, persist: false })).toThrow("exceeds 4 byte limit");
    expect(() => ingestRuntimeEvidence({ rootDir: root, otlpPath: "linked.json", persist: false })).toThrow("must stay inside repository");
  });

  it("reports explicit limitations when no providers are configured", () => {
    const report = ingestRuntimeEvidence({ rootDir: tempRoot(), generatedAt: "2026-08-02T00:00:00.000Z", persist: false });
    expect(report.sources).toEqual([]);
    expect(report.limitations.length).toBeGreaterThanOrEqual(2);
    expect(report.investigationTasks).toEqual([]);
  });
});

function tempRoot(): string {
  const root = join(tmpdir(), `codedecay-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value), "utf8");
}

function otlp(spans: unknown[], service: string, revision: string): unknown {
  return { resourceSpans: [{ resource: { attributes: [attribute("service.name", service), attribute("service.version", revision)] }, scopeSpans: [{ spans }] }] };
}

function span(
  name: string,
  spanId: string,
  flags: number,
  values: Record<string, string> = {},
  start = "1000000",
  end = "6000000"
): unknown {
  return {
    name,
    spanId,
    flags,
    startTimeUnixNano: start,
    endTimeUnixNano: end,
    status: { code: 0 },
    attributes: Object.entries(values).map(([key, value]) => attribute(key, value))
  };
}

function attribute(key: string, value: string): unknown {
  return { key, value: { stringValue: value } };
}

function node(id: string, kind: string, label: string, metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    kind,
    label,
    confidence: "declared",
    freshness: "current",
    trustClass: "declared-context",
    sources: [{ kind: "manifest", source: "fixture", repositoryId: "repo", revision: "head", observedAt: "2026-08-06T00:00:00.000Z" }],
    limitations: [],
    metadata
  };
}

function edge(id: string, from: string, to: string, kind: string): Record<string, unknown> {
  return {
    id,
    from,
    to,
    kind,
    confidence: "declared",
    freshness: "current",
    trustClass: "declared-context",
    sources: [{ kind: "manifest", source: "fixture", repositoryId: "repo", revision: "head", observedAt: "2026-08-06T00:00:00.000Z" }],
    limitations: []
  };
}
