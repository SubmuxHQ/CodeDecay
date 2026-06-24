import { describe, expect, it } from "vitest";
import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { renderJsonReport, renderMarkdownReport, renderSarifReport } from "../src/index";

const report: CodeDecayReport = {
  tool: "CodeDecay",
  version: "0.1.2",
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
  impactedRoutes: [
    {
      framework: "nextjs",
      kind: "api-route",
      route: "/api/session",
      methods: ["GET"],
      files: ["src/app/api/session/route.ts"],
      risk: "high",
      reasons: ["Next.js App Router API route changed"],
      recommendedTests: ["Add or run tests covering src/app/api/session/route.ts"]
    },
    {
      framework: "nextjs",
      kind: "ui-route",
      route: "/dashboard",
      methods: [],
      files: ["src/app/dashboard/page.tsx"],
      risk: "medium",
      reasons: ["Next.js App Router UI route changed"],
      recommendedTests: ["Add or run tests covering src/app/dashboard/page.tsx"]
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
  recommendedTests: ["src/auth/session.test.ts", "Add or run tests covering next.config.js"]
};

describe("reports", () => {
  it("renders markdown", () => {
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("CodeDecay Report");
    expect(markdown).toContain("Merge risk");
    expect(markdown).toContain("src/auth/session.ts");
    expect(markdown).toContain("### Likely Impacted Routes And APIs");
    expect(markdown).toContain("High `GET /api/session` (Next.js API route)");
    expect(markdown).toContain("Medium `/dashboard` (Next.js UI route)");
    expect(markdown).toContain("- `src/auth/session.test.ts`");
    expect(markdown).toContain("- `Add or run tests covering next.config.js`");
    expect(markdown).not.toContain("- Add or run tests covering next.config.js");
  });

  it("renders json", () => {
    const json = JSON.parse(renderJsonReport(report));

    expect(json).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "high"
      }
    });
    expect(json.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "/api/session",
          methods: ["GET"]
        })
      ])
    );
  });

  it("renders minimal sarif", () => {
    const sarif = JSON.parse(renderSarifReport(report));

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.informationUri).toBe("https://github.com/SubmuxHQ/CodeDecay");
    expect(sarif.runs[0].results[0].ruleId).toBe("risky-auth-change");
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(3);
  });
});
