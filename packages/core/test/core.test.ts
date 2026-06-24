import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CODEDECAY_VERSION,
  createAnalysisReport,
  riskLevelFromScore,
  shouldFailForRisk,
  type AnalyzerResult,
  type FileChange
} from "../src/index";

describe("CODEDECAY_VERSION", () => {
  it("matches the published CLI package version", () => {
    const packageJson = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as { version: string };

    expect(CODEDECAY_VERSION).toBe(packageJson.version);
  });
});

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
      impactedRoutes: [
        {
          framework: "express",
          kind: "route-handler",
          route: "/api/session",
          methods: ["GET"],
          files: ["src/auth/session.ts"],
          risk: "high",
          reasons: ["Express route handler changed"],
          recommendedTests: ["src/auth/session.test.ts"]
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
    expect(report.impactedRoutes).toEqual([
      {
        framework: "express",
        kind: "route-handler",
        route: "/api/session",
        methods: ["GET"],
        files: ["src/auth/session.ts"],
        risk: "high",
        reasons: ["Express route handler changed"],
        recommendedTests: ["src/auth/session.test.ts"]
      }
    ]);
    expect(report.recommendedTests).toEqual(["src/auth/session.test.ts"]);
  });

  it("propagates route-level recommended tests into report recommendations", () => {
    const report = createAnalysisReport({
      changedFiles: [
        {
          path: "src/app/api/users/route.ts",
          status: "modified",
          additions: 4,
          deletions: 1,
          addedLines: [{ line: 2, content: "export async function POST() { return Response.json({ ok: true }); }" }]
        }
      ],
      analyzerResult: {
        impactedAreas: [],
        impactedRoutes: [
          {
            framework: "nextjs",
            kind: "api-route",
            route: "/api/users",
            methods: ["POST"],
            files: ["src/app/api/users/route.ts"],
            risk: "high",
            reasons: ["Next.js App Router API route changed"],
            recommendedTests: ["Add API route coverage for POST /api/users"]
          }
        ],
        findings: [],
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.impactedRoutes?.[0]?.recommendedTests).toEqual(["Add API route coverage for POST /api/users"]);
    expect(report.recommendedTests).toEqual(["Add API route coverage for POST /api/users"]);
  });
});
