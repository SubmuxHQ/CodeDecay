import { describe, expect, it, vi } from "vitest";
import {
  createEvidence,
  createHarnessFailureResult,
  createHarnessRegistry,
  groupEvidenceBySeverity,
  sortEvidence,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type Evidence
} from "../src/index";

describe("harness registry", () => {
  it("registers and lists harnesses deterministically", () => {
    const registry = createHarnessRegistry();
    registry.register(createHarness("stryker", ["mutation-testing"]));
    registry.register(createHarness("playwright", ["browser-flow"]));

    expect(registry.list().map((harness) => harness.name)).toEqual(["playwright", "stryker"]);
    expect(registry.require("stryker").capabilities).toEqual(["mutation-testing"]);
  });

  it("rejects duplicate harness names", () => {
    const registry = createHarnessRegistry([createHarness("process", ["execution"])]);

    expect(() => registry.register(createHarness("process", ["test-execution"]))).toThrow(
      "Harness already registered: process"
    );
  });

  it("finds harnesses by capability", () => {
    const registry = createHarnessRegistry([
      createHarness("process", ["execution", "test-execution"]),
      createHarness("playwright", ["browser-flow"]),
      createHarness("vitest", ["test-execution"])
    ]);

    expect(registry.findByCapability("test-execution").map((harness) => harness.name)).toEqual(["process", "vitest"]);
    expect(registry.findByCapability("api-fuzzing")).toEqual([]);
  });

  it("validates harness shape", () => {
    expect(() => createHarnessRegistry([createHarness("", ["execution"])])).toThrow("Harness name is required.");
    expect(() => createHarnessRegistry([createHarness("empty", [])])).toThrow(
      "Harness empty must declare at least one capability."
    );
    expect(() => createHarnessRegistry([createHarness("dupe", ["execution", "execution"])])).toThrow(
      "Harness dupe has duplicate capabilities: execution"
    );
  });
});

describe("evidence schema", () => {
  it("normalizes evidence with deterministic ids", () => {
    const first = createEvidence({
      source: {
        kind: "tool",
        name: "  playwright  "
      },
      kind: "browser-flow",
      severity: "high",
      summary: "  checkout flow failed  ",
      trusted: true,
      file: "tests/checkout.spec.ts",
      line: 12,
      metadata: {
        browser: "chromium"
      }
    });

    const second = createEvidence({
      source: {
        kind: "tool",
        name: "playwright"
      },
      kind: "browser-flow",
      severity: "high",
      summary: "checkout flow failed",
      trusted: true,
      file: "tests/checkout.spec.ts",
      line: 12
    });

    expect(first).toMatchObject({
      id: second.id,
      source: {
        kind: "tool",
        name: "playwright"
      },
      kind: "browser-flow",
      severity: "high",
      summary: "checkout flow failed",
      trusted: true,
      file: "tests/checkout.spec.ts",
      line: 12,
      metadata: {
        browser: "chromium"
      }
    });
  });

  it("defaults evidence to info severity and untrusted", () => {
    const evidence = createEvidence({
      source: {
        kind: "agent",
        name: "codex"
      },
      kind: "agent-suggestion",
      summary: "Check malformed payloads"
    });

    expect(evidence).toMatchObject({
      severity: "info",
      trusted: false
    });
  });

  it("sorts and groups evidence by severity", () => {
    const evidence = [
      evidenceItem("low item", "low"),
      evidenceItem("high item", "high"),
      evidenceItem("info item", "info"),
      evidenceItem("medium item", "medium")
    ];

    expect(sortEvidence(evidence).map((item) => item.severity)).toEqual(["high", "medium", "low", "info"]);
    expect(groupEvidenceBySeverity(evidence)).toMatchObject({
      high: [expect.objectContaining({ summary: "high item" })],
      medium: [expect.objectContaining({ summary: "medium item" })],
      low: [expect.objectContaining({ summary: "low item" })],
      info: [expect.objectContaining({ summary: "info item" })]
    });
  });

  it("validates evidence input", () => {
    expect(() =>
      createEvidence({
        source: {
          kind: "tool",
          name: ""
        },
        kind: "test",
        summary: "missing source"
      })
    ).toThrow("Evidence source name is required.");

    expect(() =>
      createEvidence({
        source: {
          kind: "tool",
          name: "vitest"
        },
        kind: "test",
        summary: "",
        line: 0
      })
    ).toThrow("Evidence summary is required.");

    expect(() =>
      createEvidence({
        source: {
          kind: "tool",
          name: "vitest"
        },
        kind: "test",
        summary: "bad line",
        line: 0
      })
    ).toThrow("Evidence line must be a positive integer.");
  });
});

describe("harness failure results", () => {
  it("maps failure modes to structured run results", () => {
    const evidence = [evidenceItem("tool missing", "medium")];

    const result = createHarnessFailureResult({
      harnessName: "playwright",
      mode: "missing-tool",
      message: "Playwright is not installed.",
      evidence
    });

    expect(result).toMatchObject({
      harnessName: "playwright",
      status: "skipped",
      durationMs: 0,
      summary: "Playwright is not installed.",
      failure: {
        mode: "missing-tool",
        message: "Playwright is not installed."
      }
    });
    expect(result.evidence).toHaveLength(1);
  });

  it("summarizes harness results", () => {
    const result = createHarnessFailureResult({
      harnessName: "stryker",
      mode: "timeout",
      message: "Mutation testing timed out.",
      durationMs: 5000
    });

    expect(summarizeHarnessResult(result)).toEqual({
      harnessName: "stryker",
      status: "timed_out",
      summary: "Mutation testing timed out.",
      evidenceCount: 0,
      failure: {
        mode: "timeout",
        message: "Mutation testing timed out.",
        evidence: []
      }
    });
  });
});

function createHarness(
  name: string,
  capabilities: CodeDecayHarness["capabilities"]
): CodeDecayHarness {
  return {
    name,
    capabilities,
    requiredConfig: [],
    plan: vi.fn(async () => ({
      id: `${name}-plan`,
      harnessName: name,
      summary: `${name} plan`,
      steps: [],
      requiresApproval: false
    })),
    run: vi.fn(async () => ({
      harnessName: name,
      status: "passed" as const,
      durationMs: 0,
      evidence: [],
      artifacts: []
    })),
    collectEvidence: vi.fn(async (result) => result.evidence),
    summarize: vi.fn(async (evidence) => ({
      harnessName: name,
      status: "passed" as const,
      summary: `${name} summary`,
      evidenceCount: evidence.length
    }))
  };
}

function evidenceItem(summary: string, severity: Evidence["severity"]): Evidence {
  return createEvidence({
    source: {
      kind: "codedecay",
      name: "test"
    },
    kind: "test",
    severity,
    summary,
    trusted: true
  });
}
