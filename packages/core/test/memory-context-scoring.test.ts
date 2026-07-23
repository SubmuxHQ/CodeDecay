import { describe, expect, it } from "vitest";
import { createAnalysisReport, type FileChange, type Finding } from "../src/index";

const serviceChange: FileChange = {
  path: "src/service.ts",
  status: "modified",
  additions: 3,
  deletions: 1,
  addedLines: [{ line: 2, content: "return input;" }]
};

const memoryFindings = [
  finding("memory-invariant-impacted"),
  finding("memory-past-regression-area")
];

describe("memory context scoring boundary", () => {
  it("keeps memory visible without changing trusted risk", () => {
    const trusted = finding("risky-source-change", "medium");
    const withoutMemory = report([trusted]);
    const withMemory = report([trusted, ...memoryFindings]);

    expect(withMemory.summary.mergeRiskScore).toBe(withoutMemory.summary.mergeRiskScore);
    expect(withMemory.summary.riskLevel).toBe(withoutMemory.summary.riskLevel);
    expect(withMemory.summary.mergeRiskBreakdown?.highestSeverity).toBe(
      withoutMemory.summary.mergeRiskBreakdown?.highestSeverity
    );
    expect(
      withMemory.summary.mergeRiskBreakdown?.contributors
        .filter((contributor) => contributor.ruleId?.startsWith("memory-"))
        .map((contributor) => ({ evidence: contributor.evidence, points: contributor.points }))
    ).toEqual(
      expect.arrayContaining([
        { evidence: "memory-context", points: 0 },
        { evidence: "memory-context", points: 0 }
      ])
    );

    const memoryOnly = report(memoryFindings);
    expect(memoryOnly.summary).toMatchObject({
      mergeRiskScore: 0,
      riskLevel: "low",
      mergeRiskBreakdown: {
        contextOnly: true
      }
    });
    expect(memoryOnly.summary.mergeRiskBreakdown?.highestSeverity).toBeUndefined();
    expect(memoryOnly.summary.mergeRiskBreakdown?.notes).toContain(
      "Untrusted memory context is visible but contributes 0 score until trusted evidence corroborates it."
    );
  });

  it("does not let memory activate a trusted structural boundary", () => {
    const changes = [
      change("src/db/schema.ts"),
      change("src/config/runtime.ts")
    ];
    const trusted = [
      finding("risky-database-change", "medium"),
      finding("risky-config-change", "medium", "configuration")
    ];
    const withoutMemory = report(trusted, changes);
    const withMemory = report([...trusted, memoryFindings[1]!], changes);

    expect(withMemory.summary.mergeRiskScore).toBe(withoutMemory.summary.mergeRiskScore);
    expect(
      withMemory.summary.mergeRiskBreakdown?.contributors.some(
        (contributor) => contributor.id === "runtime-persistence-boundary"
      )
    ).toBe(false);
  });
});

function report(findings: Finding[], changedFiles: FileChange[] = [serviceChange]) {
  return createAnalysisReport({
    changedFiles,
    analyzerResult: {
      impactedAreas: [],
      findings,
      recommendedTests: ["Verify editable memory context"]
    },
    generatedAt: "2026-07-23T00:00:00.000Z"
  });
}

function finding(
  ruleId: string,
  severity: Finding["severity"] = "high",
  category: Finding["category"] = "regression"
): Finding {
  return {
    ruleId,
    title: ruleId,
    description: ruleId.startsWith("memory-") ? "Untrusted memory context." : "Trusted deterministic signal.",
    severity,
    category,
    file: "src/service.ts",
    line: 2
  };
}

function change(path: string): FileChange {
  return {
    ...serviceChange,
    path
  };
}
