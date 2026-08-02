import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestRuntimeEvidence, normalizeServiceTopologyGraph } from "../src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
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

    const report = ingestRuntimeEvidence({ rootDir: root, otlpPath: "traces.json", errorsPath: "errors.json", headRevision: "head-sha", topology, generatedAt: "2026-08-02T00:00:00.000Z" });
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

    const report = ingestRuntimeEvidence({ rootDir: root, otlpPath: "traces.json", errorsPath: "errors.json", headRevision: "head", maxSpans: 1 });

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

    expect(() => ingestRuntimeEvidence({ rootDir: root, otlpPath: "large.json", maxInputBytes: 4 })).toThrow("exceeds 4 byte limit");
    expect(() => ingestRuntimeEvidence({ rootDir: root, otlpPath: "linked.json" })).toThrow("must stay inside repository");
  });

  it("reports explicit limitations when no providers are configured", () => {
    const report = ingestRuntimeEvidence({ rootDir: tempRoot(), generatedAt: "2026-08-02T00:00:00.000Z" });
    expect(report.sources).toEqual([]);
    expect(report.limitations).toHaveLength(2);
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

function span(name: string, spanId: string, flags: number, values: Record<string, string> = {}): unknown {
  return { name, spanId, flags, startTimeUnixNano: "1000000", endTimeUnixNano: "6000000", status: { code: 0 }, attributes: Object.entries(values).map(([key, value]) => attribute(key, value)) };
}

function attribute(key: string, value: string): unknown {
  return { key, value: { stringValue: value } };
}
