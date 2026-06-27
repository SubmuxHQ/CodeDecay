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
    },
    mergeRiskBreakdown: {
      score: 72,
      rawScore: 78,
      adjustedScore: 72,
      highestSeverity: "high",
      heuristicOnly: false,
      contributors: [
        {
          id: "risky-auth-change:src/auth/session.ts:3",
          label: "Auth changed",
          points: 30,
          evidence: "direct",
          reason: "Auth behavior changed.",
          category: "regression",
          severity: "high",
          ruleId: "risky-auth-change",
          file: "src/auth/session.ts",
          line: 3
        }
      ],
      dampeners: [],
      notes: []
    },
    decayBreakdown: {
      score: 44,
      rawScore: 44,
      adjustedScore: 44,
      highestSeverity: "medium",
      heuristicOnly: false,
      contributors: [
        {
          id: "high-complexity:src/auth/session.ts:3",
          label: "High complexity",
          points: 16,
          evidence: "heuristic",
          reason: "Complexity increased.",
          category: "decay",
          severity: "medium",
          ruleId: "high-complexity",
          file: "src/auth/session.ts",
          line: 3
        }
      ],
      dampeners: [],
      notes: []
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
  recommendedTests: ["src/auth/session.test.ts", "Add or run tests covering next.config.js"],
  testEvidence: {
    mode: "runtime_augmented",
    sources: [{ kind: "istanbul", path: "coverage/coverage-final.json" }],
    changedSources: [
      {
        path: "src/auth/session.ts",
        status: "partial",
        measuredLines: [3, 4],
        coveredLines: [3],
        uncoveredLines: [4],
        sourceKinds: ["istanbul"],
        sourcePaths: ["coverage/coverage-final.json"]
      }
    ],
    notes: ["Runtime coverage artifacts were found, but some changed paths were not measured: src/app/dashboard/page.tsx."]
  },
  productFailureBundles: [
    {
      schemaVersion: 1,
      id: "ui-login-failure",
      checkId: "ui.login.success",
      checkKind: "ui",
      priority: "high",
      target: {
        id: "web",
        environment: "preview",
        baseUrl: "https://preview.example.test"
      },
      title: "Login flow fails on preview",
      summary: "The browser reached the login form, but the authenticated dashboard never rendered.",
      classification: "confirmed-regression",
      classificationConfidence: 0.92,
      failedStep: {
        index: 3,
        label: "Submit valid credentials",
        status: "failed",
        expected: "Dashboard heading is visible",
        actual: "Login form remains visible"
      },
      neighboringSteps: [
        {
          index: 2,
          label: "Fill valid credentials",
          status: "passed"
        }
      ],
      artifacts: [
        {
          kind: "screenshot",
          path: ".codedecay/artifacts/login-failure.png",
          label: "Failure screenshot"
        },
        {
          kind: "test-source",
          path: ".codedecay/artifacts/login.spec.ts"
        }
      ],
      expected: "User lands on /dashboard after login.",
      actual: "User remains on /login with no error message.",
      impactedFiles: ["src/auth/session.ts", "src/app/login/page.tsx"],
      rootCauseHypothesis: "The changed session helper may no longer persist the login cookie.",
      suggestedFixTasks: ["Inspect session cookie persistence.", "Add a Playwright regression for successful login."],
      rerunCommand: "npx codedecay product run --check ui.login.success"
    },
    {
      schemaVersion: 1,
      id: "api-session-failure",
      checkId: "api.session.invalid-token",
      checkKind: "api",
      priority: "medium",
      target: {
        id: "api",
        baseUrl: "https://preview.example.test"
      },
      title: "Invalid token API response changed",
      summary: "The API returned a 500 instead of a stable 401 error response.",
      classification: "confirmed-regression",
      failedStep: {
        index: 1,
        label: "GET /api/session with invalid token",
        status: "failed"
      },
      neighboringSteps: [],
      artifacts: [
        {
          kind: "request-response-diff",
          path: ".codedecay/artifacts/session.diff"
        }
      ],
      expected: "401 JSON error response.",
      actual: "500 HTML error response.",
      impactedFiles: ["src/auth/session.ts"],
      suggestedFixTasks: ["Restore explicit invalid-token handling."],
      rerunCommand: "npx codedecay product run --check api.session.invalid-token"
    }
  ]
};

describe("reports", () => {
  it("renders markdown", () => {
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("CodeDecay Report");
    expect(markdown).toContain("Merge risk");
    expect(markdown).toContain("src/auth/session.ts");
    expect(markdown).toContain("### Likely Impacted Routes And APIs");
    expect(markdown).toContain("### Merge Risk Breakdown");
    expect(markdown).toContain("### Test Evidence");
    expect(markdown).toContain("### Product Failure Bundles");
    expect(markdown).toContain("#### High Login flow fails on preview");
    expect(markdown).toContain("- Classification: confirmed regression (92% confidence)");
    expect(markdown).toContain("- Rerun: `npx codedecay product run --check ui.login.success`");
    expect(markdown).toContain("request-response-diff");
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
    expect(json.productFailureBundles[0]).toMatchObject({
      schemaVersion: 1,
      checkId: "ui.login.success",
      checkKind: "ui",
      priority: "high",
      target: {
        id: "web"
      }
    });
  });

  it("renders minimal sarif", () => {
    const sarif = JSON.parse(renderSarifReport(report));

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.informationUri).toBe("https://github.com/SubmuxHQ/CodeDecay");
    expect(sarif.runs[0].results[0].ruleId).toBe("risky-auth-change");
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(3);
    expect(sarif.runs[0].properties.mergeRiskBreakdown.score).toBe(72);
    expect(sarif.runs[0].results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "product-verification/ui/ui.login.success",
          locations: [
            expect.objectContaining({
              physicalLocation: expect.objectContaining({
                artifactLocation: {
                  uri: "src/auth/session.ts"
                }
              })
            })
          ]
        }),
        expect.objectContaining({
          ruleId: "product-verification/api/api.session.invalid-token"
        })
      ])
    );
    expect(sarif.runs[0].properties.productFailureBundles).toHaveLength(2);
  });
});
