import { describe, expect, it } from "vitest";
import { createEvidence, createHarnessFailureResult, summarizeHarnessResult, type Evidence } from "../src/index";

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
