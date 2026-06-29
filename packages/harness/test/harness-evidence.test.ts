import { describe, expect, it } from "vitest";
import { createEvidence, groupEvidenceBySeverity, sortEvidence, type Evidence } from "../src/index";

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
