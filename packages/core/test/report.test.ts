import { describe, expect, it } from "vitest";
import { createAnalysisReport, findingCounts, productFailureBundlesFromProductTargetReport, shouldFailForRisk } from "../src/index";
import type { AnalyzerResult, FileChange, Finding } from "../src/index";

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
          ruleId: "security-sql-injection",
          title: "SQL injection candidate",
          description: "Unsafe SQL construction.",
          severity: "high",
          category: "security",
          file: "src/auth/session.ts",
          line: 4
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
      securityCandidates: [
        {
          ruleId: "security-sql-injection",
          cwe: "CWE-89",
          title: "SQL injection candidate",
          description: "Unsafe SQL construction.",
          severity: "high",
          confidence: "direct",
          file: "src/auth/session.ts",
          line: 4,
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
          }
        ],
        supportedFiles: ["src/auth/session.ts"],
        limitedFiles: [],
        unsupportedFiles: []
      },
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
    expect(report.summary.securityScore).toBeGreaterThan(0);
    expect(report.summary.findingCounts.high).toBe(2);
    expect(report.summary.mergeRiskBreakdown?.contributors.length).toBeGreaterThan(0);
    expect(report.summary.decayBreakdown?.contributors.length).toBeGreaterThan(0);
    expect(report.summary.securityBreakdown?.contributors[0]?.ruleId).toBe("security-sql-injection");
    expect(report.languageAnalysis?.supportedFiles).toEqual(["src/auth/session.ts"]);
    expect(report.securityCandidates?.[0]?.cwe).toBe("CWE-89");
    expect(report.securityAnalysis?.scannedFiles).toEqual(["src/auth/session.ts"]);
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

  it("merges duplicate impacted routes and areas deterministically", () => {
    const report = createAnalysisReport({
      changedFiles: [
        {
          path: "src/app/api/users/route.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          addedLines: [{ line: 4, content: "export async function GET() { return Response.json([]); }" }]
        }
      ],
      analyzerResult: {
        impactedAreas: [
          {
            name: "API routes",
            kind: "api",
            risk: "medium",
            files: ["src/app/api/users/route.ts"]
          },
          {
            name: "API routes",
            kind: "api",
            risk: "high",
            files: ["src/app/api/users/service.ts", "src/app/api/users/route.ts"]
          }
        ],
        impactedRoutes: [
          {
            framework: "nextjs",
            kind: "api-route",
            route: "/api/users",
            methods: ["GET"],
            files: ["src/app/api/users/route.ts"],
            risk: "medium",
            reasons: ["Route handler changed"],
            recommendedTests: ["Add GET /api/users coverage"]
          },
          {
            framework: "nextjs",
            kind: "api-route",
            route: "/api/users",
            methods: ["POST", "GET"],
            files: ["src/app/api/users/service.ts"],
            risk: "high",
            reasons: ["Service dependency changed"],
            recommendedTests: ["Add POST /api/users coverage"]
          }
        ],
        findings: [],
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.impactedAreas).toEqual([
      {
        name: "API routes",
        kind: "api",
        risk: "high",
        files: ["src/app/api/users/route.ts", "src/app/api/users/service.ts"]
      }
    ]);
    expect(report.impactedRoutes).toEqual([
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/users",
        methods: ["GET", "POST"],
        files: ["src/app/api/users/route.ts", "src/app/api/users/service.ts"],
        risk: "high",
        reasons: ["Route handler changed", "Service dependency changed"],
        recommendedTests: ["Add GET /api/users coverage", "Add POST /api/users coverage"]
      }
    ]);
    expect(report.recommendedTests).toEqual(["Add GET /api/users coverage", "Add POST /api/users coverage"]);
  });

  it("sorts product failure bundles and normalizes nested evidence", () => {
    const report = createAnalysisReport({
      changedFiles: [
        {
          path: "src/app/login/page.tsx",
          status: "modified",
          additions: 5,
          deletions: 1,
          addedLines: [{ line: 7, content: "return <LoginForm />;" }]
        }
      ],
      analyzerResult: {
        impactedAreas: [],
        findings: [],
        recommendedTests: []
      },
      productFailureBundles: [
        {
          schemaVersion: 1,
          id: "api-session",
          checkId: "api.session.invalid-token",
          checkKind: "api",
          priority: "medium",
          target: {
            id: "api",
            baseUrl: "https://preview.example.test"
          },
          title: "Invalid token API response changed",
          summary: "The API returned the wrong status.",
          classification: "confirmed-regression",
          failedStep: {
            index: 2,
            label: "Call API",
            status: "failed"
          },
          neighboringSteps: [],
          artifacts: [],
          expected: "401",
          actual: "500",
          impactedFiles: ["src/auth/session.ts"],
          suggestedFixTasks: ["Restore invalid-token handling."],
          rerunCommand: "npx codedecay product run --check api.session.invalid-token"
        },
        {
          schemaVersion: 1,
          id: "ui-login",
          checkId: "ui.login.success",
          checkKind: "ui",
          priority: "high",
          target: {
            id: "web",
            baseUrl: "https://preview.example.test"
          },
          title: "Login flow fails",
          summary: "The dashboard never renders.",
          classification: "confirmed-regression",
          classificationConfidence: 0.9,
          failedStep: {
            index: 3,
            label: "Submit credentials",
            status: "failed"
          },
          neighboringSteps: [
            {
              index: 2,
              label: "Fill password",
              status: "passed"
            },
            {
              index: 1,
              label: "Open login",
              status: "passed"
            }
          ],
          artifacts: [
            {
              kind: "test-source",
              path: ".codedecay/artifacts/login.spec.ts"
            },
            {
              kind: "screenshot",
              path: ".codedecay/artifacts/login.png"
            }
          ],
          expected: "Dashboard",
          actual: "Login form",
          impactedFiles: ["src/app/login/page.tsx", "src/app/login/page.tsx"],
          rootCauseHypothesis: "The submit handler no longer redirects.",
          suggestedFixTasks: ["Add login regression.", "Add login regression."],
          rerunCommand: "npx codedecay product run --check ui.login.success"
        }
      ],
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.productFailureBundles?.map((bundle) => bundle.id)).toEqual(["ui-login", "api-session"]);
    expect(report.productFailureBundles?.[0]?.neighboringSteps.map((step) => step.index)).toEqual([1, 2]);
    expect(report.productFailureBundles?.[0]?.impactedFiles).toEqual(["src/app/login/page.tsx"]);
    expect(report.productFailureBundles?.[0]?.suggestedFixTasks).toEqual(["Add login regression."]);
  });

  it("maps product target reports into product failure bundles", () => {
    const bundles = productFailureBundlesFromProductTargetReport({
      targets: [
        {
          id: "api",
          baseUrl: "http://127.0.0.1:3000",
          status: "failed",
          generatedApiTestRun: {
            failures: [
              {
                testId: "api-get-users",
                title: "GET /api/users returns a documented status",
                failingStep: "Run generated test.",
                error: "Expected documented status 200 but got 500.",
                request: {
                  method: "GET",
                  url: "http://127.0.0.1:3000/api/users"
                },
                expected: "GET /api/users should return one of the documented statuses 200.",
                actual: "Expected documented status 200 but got 500.",
                impactedFiles: ["src/api/users.ts"],
                testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
                rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
              }
            ]
          }
        }
      ]
    });

    expect(bundles).toEqual([
      expect.objectContaining({
        id: "api-api-api-get-users",
        checkId: "api-get-users",
        checkKind: "api",
        priority: "high",
        classification: "confirmed-regression",
        classificationConfidence: 0.72,
        classificationEvidence: expect.arrayContaining(["API response evidence points to a server error, undocumented status, or response contract drift."]),
        target: {
          id: "api",
          baseUrl: "http://127.0.0.1:3000"
        },
        expected: "GET /api/users should return one of the documented statuses 200.",
        actual: "Expected documented status 200 but got 500.",
        impactedFiles: ["src/api/users.ts"],
        rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown",
        suggestedFixTasks: expect.arrayContaining([
          "Inspect the failing API route, request data, auth setup, and response contract; fix product behavior before changing the generated test.",
          "Treat auto-healing as review-only: do not update expected behavior unless a human confirms the product requirement changed."
        ])
      })
    ]);
    expect(bundles[0]?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "test-source" }),
        expect.objectContaining({ kind: "request-response-diff" })
      ])
    );
  });

  it("classifies flaky generated checks from repeat evidence", () => {
    const bundles = productFailureBundlesFromProductTargetReport({
      targets: [
        {
          id: "web",
          status: "failed",
          generatedTestRun: {
            failures: [
              {
                testId: "route-settings",
                title: "loads /settings",
                error: "Timeout while waiting for body.",
                retryEvidence: {
                  attempts: 2,
                  passed: 1,
                  failed: 1,
                  conclusion: "passed-on-rerun"
                },
                testSourcePath: ".codedecay/local/generated-tests/web/product.generated.spec.ts"
              }
            ]
          }
        }
      ]
    });

    expect(bundles[0]).toMatchObject({
      classification: "likely-flaky",
      classificationConfidence: 0.85,
      classificationEvidence: ["The generated check failed initially and passed on a targeted rerun."],
      suggestedFixTasks: expect.arrayContaining([
        "If behavior is correct, propose a reviewed wait/assertion stabilization patch for the generated test."
      ])
    });
  });

  it("separates setup and environment failures from product regressions", () => {
    const bundles = productFailureBundlesFromProductTargetReport({
      targets: [
        {
          id: "web-auth",
          status: "failed",
          setup: {
            status: "failed",
            error: "Login seed failed with unauthorized token."
          }
        },
        {
          id: "web-preview",
          status: "blocked",
          health: {
            status: "timed_out",
            error: "Preview URL health check timed out."
          }
        }
      ]
    });

    expect(bundles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "web-auth-workflow-failed",
          classification: "auth-or-test-data-failure",
          suggestedFixTasks: expect.arrayContaining(["Add or repair auth setup, seeded fixtures, test accounts, permissions, or data reset before changing assertions."])
        }),
        expect.objectContaining({
          id: "web-preview-workflow-blocked",
          classification: "environment-failure",
          suggestedFixTasks: expect.arrayContaining(["Fix preview URL, local startup, browser/Playwright install, network, or health-check setup before treating this as product behavior."])
        })
      ])
    );
  });

  it("caps merge risk at low when all merge-risk findings are low severity", () => {
    const changedFiles = createSyntheticChanges(16);
    const findings = createSyntheticFindings(16, "low", "risky-auth-change");

    const report = createAnalysisReport({
      changedFiles,
      analyzerResult: {
        impactedAreas: [],
        findings,
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBe(39);
    expect(report.summary.riskLevel).toBe("low");
    expect(shouldFailForRisk(report.summary.riskLevel, "high")).toBe(false);
  });

  it("caps merge risk at medium when all merge-risk findings are medium severity", () => {
    const changedFiles = createSyntheticChanges(8);
    const findings = createSyntheticFindings(8, "medium", "risky-auth-change");

    const report = createAnalysisReport({
      changedFiles,
      analyzerResult: {
        impactedAreas: [],
        findings,
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBe(69);
    expect(report.summary.riskLevel).toBe("medium");
    expect(shouldFailForRisk(report.summary.riskLevel, "high")).toBe(false);
    expect(shouldFailForRisk(report.summary.riskLevel, "medium")).toBe(true);
  });

  it("allows high merge risk when high-severity findings are present", () => {
    const changedFiles = createSyntheticChanges(3);
    const findings = createSyntheticFindings(3, "high", "risky-auth-change");

    const report = createAnalysisReport({
      changedFiles,
      analyzerResult: {
        impactedAreas: [],
        findings,
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBeGreaterThanOrEqual(70);
    expect(report.summary.riskLevel).toBe("high");
    expect(shouldFailForRisk(report.summary.riskLevel, "high")).toBe(true);
  });

  it("treats runtime config and database changes together as high production risk", () => {
    const report = createAnalysisReport({
      changedFiles: [
        {
          path: "next.config.js",
          status: "modified",
          additions: 8,
          deletions: 6,
          addedLines: [{ line: 2, content: "const sessionSecret = env.SESSION_SECRET ?? 'dev-secret';" }]
        },
        {
          path: "src/db/schema.js",
          status: "modified",
          additions: 4,
          deletions: 1,
          addedLines: [{ line: 2, content: '  role: "admin",' }]
        }
      ],
      analyzerResult: {
        impactedAreas: [],
        findings: [
          {
            ruleId: "risky-config-change",
            title: "Config area changed",
            description: "Runtime config changed.",
            severity: "medium",
            category: "configuration",
            file: "next.config.js",
            line: 2
          },
          {
            ruleId: "risky-database-change",
            title: "Database area changed",
            description: "Database defaults changed.",
            severity: "high",
            category: "regression",
            file: "src/db/schema.js",
            line: 2
          },
          {
            ruleId: "missing-nearby-tests",
            title: "Risky source changes without changed tests",
            description: "Risky source changed without changed tests.",
            severity: "high",
            category: "coverage",
            file: "next.config.js",
            line: 2
          }
        ],
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBeGreaterThanOrEqual(70);
    expect(report.summary.riskLevel).toBe("high");
    expect(report.summary.mergeRiskBreakdown?.contributors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "runtime-persistence-boundary", points: 8 })])
    );
  });

  it("caps heuristic-only merge risk below high even with severe findings", () => {
    const changedFiles = createSyntheticChanges(6);
    const findings = createSyntheticFindings(4, "high", "snapshot-only-test", "coverage");

    const report = createAnalysisReport({
      changedFiles,
      analyzerResult: {
        impactedAreas: [],
        findings,
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBeLessThanOrEqual(54);
    expect(report.summary.mergeRiskBreakdown?.heuristicOnly).toBe(true);
    expect(report.summary.mergeRiskBreakdown?.dampeners).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "heuristic-only-dampener" })])
    );
  });

  it("caps heuristic-only decay so proximity findings do not force high risk", () => {
    const changedFiles = createSyntheticChanges(6);
    const findings = createSyntheticFindings(6, "high", "high-complexity", "decay");

    const report = createAnalysisReport({
      changedFiles,
      analyzerResult: {
        impactedAreas: [],
        findings,
        recommendedTests: []
      },
      generatedAt: "2026-06-22T00:00:00.000Z"
    });

    expect(report.summary.mergeRiskScore).toBe(0);
    expect(report.summary.decayScore).toBeLessThanOrEqual(54);
    expect(report.summary.riskLevel).not.toBe("high");
    expect(report.summary.decayBreakdown?.heuristicOnly).toBe(true);
    expect(report.summary.decayBreakdown?.dampeners).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "heuristic-only-dampener" })])
    );
  });
});

function createSyntheticChanges(count: number): FileChange[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `src/file-${index}.ts`,
    status: "modified",
    additions: 4,
    deletions: 1,
    addedLines: [{ line: 1, content: `export const value${index} = true;` }]
  }));
}

function createSyntheticFindings(
  count: number,
  severity: Finding["severity"],
  ruleId: string = `synthetic-${severity}`,
  category: Finding["category"] = "regression"
): Finding[] {
  return Array.from({ length: count }, (_, index) => ({
    ruleId: `${ruleId}-${index}`,
    title: "Synthetic finding",
    description: "Synthetic scoring fixture.",
    severity,
    category,
    file: `src/file-${index}.ts`,
    line: 1
  }));
}
