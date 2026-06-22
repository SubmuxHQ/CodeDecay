import { describe, expect, it } from "vitest";
import {
  createAnalysisReport,
  riskLevelFromScore,
  shouldFailForRisk,
  type AnalyzerResult,
  type FileChange
} from "../src/index";

describe("riskLevelFromScore", () => {
  it("maps low, medium, and high thresholds", () => {
    expect(riskLevelFromScore(0)).toBe("low");
    expect(riskLevelFromScore(39)).toBe("low");
    expect(riskLevelFromScore(40)).toBe("medium");
    expect(riskLevelFromScore(69)).toBe("medium");
    expect(riskLevelFromScore(70)).toBe("high");
    expect(riskLevelFromScore(100)).toBe("high");
  });
});

describe("shouldFailForRisk", () => {
  it("fails only when actual risk reaches the configured threshold", () => {
    expect(shouldFailForRisk("high", "medium")).toBe(true);
    expect(shouldFailForRisk("medium", "high")).toBe(false);
    expect(shouldFailForRisk("low", "low")).toBe(true);
  });
});

describe("createAnalysisReport", () => {
  it("calculates merge and decay scores from findings", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/auth/session.ts",
        status: "modified",
        additions: 12,
        deletions: 2,
        addedLines: [{ line: 3, content: "if (!token) return null;" }]
      }
    ];

    const analyzerResult: AnalyzerResult = {
      impactedAreas: [
        {
          name: "Authentication and authorization",
          kind: "auth",
          risk: "high",
          files: ["src/auth/session.ts"]
        }
      ],
      findings: [
        {
          ruleId: "risky-auth-change",
          title: "Auth changed",
          description: "Auth behavior changed.",
          severity: "high",
          category: "regression",
          file: "src/auth/session.ts",
          line: 3
        },
        {
          ruleId: "high-complexity",
          title: "High complexity",
          description: "Complexity increased.",
          severity: "medium",
          category: "decay",
          file: "src/auth/session.ts",
          line: 3
        }
      ],
      recommendedTests: ["src/auth/session.test.ts"]
    };

    const report = createAnalysisReport({
      base: "main",
      head: "HEAD",
      changedFiles,
      analyzerResult,
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBeGreaterThan(0);
    expect(report.summary.decayScore).toBeGreaterThan(0);
    expect(report.summary.findingCounts.high).toBe(1);
    expect(report.recommendedTests).toEqual(["src/auth/session.test.ts"]);
  });
});
