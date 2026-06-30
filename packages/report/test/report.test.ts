import { describe, expect, it } from "vitest";
import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { renderJsonReport, renderMarkdownReport, renderPrCommentReport, renderReport, renderSarifReport } from "../src/index";

const report: CodeDecayReport = {
  tool: "CodeDecay",
  version: "0.1.2",
  generatedAt: "2026-06-22T00:00:00.000Z",
  base: "main",
  head: "HEAD",
  summary: {
    mergeRiskScore: 72,
    decayScore: 44,
    securityScore: 36,
    riskLevel: "high",
    findingCounts: {
      low: 0,
      medium: 1,
      high: 2
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
    },
    securityBreakdown: {
      score: 36,
      rawScore: 36,
      adjustedScore: 36,
      highestSeverity: "high",
      heuristicOnly: false,
      contributors: [
        {
          id: "security-sql-injection:src/auth/session.ts:3",
          label: "SQL injection candidate",
          points: 30,
          evidence: "direct",
          reason: "Unsafe SQL construction.",
          category: "security",
          severity: "high",
          ruleId: "security-sql-injection",
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
    },
    {
      ruleId: "security-sql-injection",
      title: "SQL injection candidate",
      description: "Unsafe SQL construction.",
      severity: "high",
      category: "security",
      file: "src/auth/session.ts",
      line: 3
    }
  ],
  securityCandidates: [
    {
      ruleId: "security-sql-injection",
      cwe: "CWE-89",
      title: "SQL injection candidate",
      description: "Unsafe SQL construction.",
      severity: "high",
      confidence: "direct",
      file: "src/auth/session.ts",
      line: 3,
      evidence: "Raw SQL is built from request input."
    }
  ],
  securityAnalysis: {
    scannedFiles: ["src/auth/session.ts"],
    candidateCount: 1,
    skippedFiles: []
  },
  languageAnalysis: {
    files: [
      {
        path: "src/auth/session.ts",
        language: "typescript",
        status: "supported",
        parser: "typescript-estree",
        capabilities: ["path-classification", "route-impact", "security-matchers"]
      },
      {
        path: "src/auth.py",
        language: "python",
        status: "limited",
        parser: "none",
        capabilities: ["path-classification", "runtime-coverage", "test-audit"],
        limitation: "Python files use path/test/coverage signals until a Python parser adapter is added."
      }
    ],
    supportedFiles: ["src/auth/session.ts"],
    limitedFiles: ["src/auth.py"],
    unsupportedFiles: []
  },
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
    expect(markdown).toContain("Security risk");
    expect(markdown).toContain("src/auth/session.ts");
    expect(markdown).toContain("### Likely Impacted Routes And APIs");
    expect(markdown).toContain("### Merge Risk Breakdown");
    expect(markdown).toContain("### Language And Parser Coverage");
    expect(markdown).toContain("Fully supported parser files: 1");
    expect(markdown).toContain("limited `src/auth.py`");
    expect(markdown).toContain("### Security Risk Breakdown");
    expect(markdown).toContain("### Security Matcher Coverage");
    expect(markdown).toContain("Changed source files scanned: 1");
    expect(markdown).toContain("### Security Candidates");
    expect(markdown).toContain("CWE-89");
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
        riskLevel: "high",
        securityScore: 36
      }
    });
    expect(json.securityCandidates[0]).toMatchObject({
      ruleId: "security-sql-injection",
      cwe: "CWE-89",
      confidence: "direct"
    });
    expect(json.securityAnalysis.scannedFiles).toEqual(["src/auth/session.ts"]);
    expect(json.languageAnalysis.limitedFiles).toEqual(["src/auth.py"]);
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

  it("renders compact pr-comment markdown with a lead catch and collapsed full report", () => {
    const markdown = renderPrCommentReport(report);

    expect(markdown).toContain("## CodeDecay PR Check");
    expect(markdown).toContain("**Lead catch:** Auth changed — `src/auth/session.ts:3`");
    expect(markdown).toContain("Auth behavior changed.");
    expect(markdown).toContain("<details>");
    expect(markdown).toContain("<summary>Full CodeDecay report</summary>");
    expect(markdown).toContain("## CodeDecay Report");
    expect(markdown).toContain("Found by [CodeDecay](https://github.com/SubmuxHQ/CodeDecay) - deterministic, local-first, no telemetry.");
    expect(markdown).not.toContain("https://github.com/SubmuxHQ/CodeDecay?");
  });

  it("dispatches pr-comment format through renderReport", () => {
    const markdown = renderReport(report, "pr-comment");

    expect(markdown).toContain("## CodeDecay PR Check");
    expect(markdown).toContain("Full CodeDecay report");
  });

  it("renders minimal sarif", () => {
    const sarif = JSON.parse(renderSarifReport(report));

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.informationUri).toBe("https://github.com/SubmuxHQ/CodeDecay");
    expect(sarif.runs[0].results[0].ruleId).toBe("risky-auth-change");
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(3);
    expect(sarif.runs[0].properties.mergeRiskBreakdown.score).toBe(72);
    expect(sarif.runs[0].properties.securityScore).toBe(36);
    expect(sarif.runs[0].properties.languageAnalysis.limitedFiles).toEqual(["src/auth.py"]);
    expect(sarif.runs[0].properties.securityAnalysis.scannedFiles).toEqual(["src/auth/session.ts"]);
    expect(sarif.runs[0].properties.securityCandidates[0].ruleId).toBe("security-sql-injection");
    expect(sarif.runs[0].results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-sql-injection"
        }),
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
