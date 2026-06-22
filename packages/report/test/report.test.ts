import { describe, expect, it } from "vitest";
import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { renderJsonReport, renderMarkdownReport, renderSarifReport } from "../src/index";

const report: CodeDecayReport = {
  tool: "CodeDecay",
  version: "0.0.0",
  generatedAt: "2026-06-22T00:00:00.000Z",
  base: "main",
  head: "HEAD",
  summary: {
    mergeRiskScore: 72,
    decayScore: 44,
    riskLevel: "high",
    findingCounts: {
      low: 0,
      medium: 1,
      high: 1
    }
  },
  changedFiles: [
    {
      path: "src/auth/session.ts",
      status: "modified",
      additions: 4,
      deletions: 1,
      addedLines: [{ line: 3, content: "return null;" }]
    }
  ],
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
    }
  ],
  recommendedTests: ["src/auth/session.test.ts"]
};

describe("reports", () => {
  it("renders markdown", () => {
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("CodeDecay Report");
    expect(markdown).toContain("Merge risk");
    expect(markdown).toContain("src/auth/session.ts");
  });

  it("renders json", () => {
    expect(JSON.parse(renderJsonReport(report))).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "high"
      }
    });
  });

  it("renders minimal sarif", () => {
    const sarif = JSON.parse(renderSarifReport(report));

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results[0].ruleId).toBe("risky-auth-change");
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(3);
  });
});
