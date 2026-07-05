import type { RedteamReport } from "@submuxhq/codedecay-redteam";

export function createFixtureReport(): RedteamReport {
  return {
    tool: "CodeDecay",
    version: "0.1.5",
    generatedAt: "2026-06-24T00:00:00.000Z",
    mode: "deterministic",
    summary: {
      mergeRiskScore: 88,
      decayScore: 42,
      securityScore: 0,
      riskLevel: "high",
      changedFiles: 1,
      impactedAreas: 1,
      impactedRoutes: 1,
      symbolImpacts: 1,
      testProofEntries: 1,
      missingTestFindings: 0,
      findings: {
        low: 0,
        medium: 1,
        high: 1
      },
      weakTestFindings: 1,
      testProofStatus: "weak",
      edgeCases: 1,
      configuredChecks: 1,
      toolAdapters: 1,
      patternInsights: 0,
      productFailureBundles: 1,
      verificationStatus: "not-run",
      skills: 1,
      fixTasks: 2,
      investigationSuggestions: 0,
      investigationLimitations: 0
    },
    analysis: {
      tool: "CodeDecay",
      version: "0.1.5",
      generatedAt: "2026-06-24T00:00:00.000Z",
      changedFiles: [
        {
          path: "src/api/imu.ts",
          status: "modified",
          additions: 4,
          deletions: 1,
          addedLines: [
            {
              line: 10,
              content: "return Response.json({ ok: true });"
            }
          ]
        }
      ],
      impactedAreas: [
        {
          kind: "api",
          name: "API surface",
          risk: "high",
          files: ["src/api/imu.ts"]
        }
      ],
      impactedRoutes: [
        {
          framework: "express",
          kind: "route-handler",
          route: "/api/imu",
          methods: ["POST"],
          files: ["src/api/imu.ts"],
          risk: "high",
          reasons: ["IMU ingestion route changed"],
          recommendedTests: ["Add API-level IMU regression test."]
        }
      ],
      symbolImpactGraph: {
        schemaVersion: 1,
        artifactPath: ".codedecay/local/symbol-impact-graph.json",
        fileCount: 2,
        edgeCount: 1
      },
      symbolImpacts: [
        {
          file: "src/api/imu.ts",
          symbol: "submitImu",
          exportKind: "named",
          line: 10,
          importerFiles: ["src/api/imu.test.ts"],
          routeFiles: ["src/api/imu.ts"],
          likelyTests: ["src/api/imu.test.ts"],
          reasons: ["src/api/imu.ts#submitImu -> src/api/imu.test.ts#submitImu (named import)"]
        }
      ],
      testProofMap: {
        summary: {
          total: 1,
          provenByRuntimeCoverage: 0,
          referencedOnlyStatically: 0,
          weakenedByMocking: 1,
          unproven: 0
        },
        entries: [
          {
            file: "src/api/imu.ts",
            symbol: "submitImu",
            line: 10,
            status: "weakened_by_mocking",
            evidence: "weak-mock",
            proof: "deterministic",
            staticReferences: ["src/api/imu.test.ts"],
            routeFiles: ["src/api/imu.ts"],
            weakenedByMocks: ["src/api/imu.test.ts"],
            reasons: ["Static test references mock the changed boundary in src/api/imu.test.ts."],
            repairTask: "Add an integration test that reaches src/api/imu.ts#submitImu without mocking submitImu."
          }
        ]
      },
      findings: [],
      recommendedTests: [],
      productFailureBundles: [
        {
          schemaVersion: 1,
          id: "ui-imu-submit",
          checkId: "ui.imu.submit",
          checkKind: "ui",
          priority: "high",
          target: {
            id: "web",
            baseUrl: "http://127.0.0.1:3000"
          },
          title: "IMU submit flow fails",
          summary: "Submitting an IMU reading no longer shows the success state.",
          classification: "confirmed-regression",
          failedStep: {
            index: 3,
            label: "Submit IMU reading",
            status: "failed"
          },
          neighboringSteps: [],
          artifacts: [
            {
              kind: "screenshot",
              path: ".codedecay/artifacts/imu-submit.png"
            }
          ],
          expected: "Success toast appears.",
          actual: "The form stays pending.",
          impactedFiles: ["src/api/imu.ts"],
          suggestedFixTasks: ["Check IMU submit handler and API response shape."],
          rerunCommand: "npx codedecay product run --check ui.imu.submit"
        }
      ],
      summary: {
        mergeRiskScore: 88,
        decayScore: 42,
        securityScore: 0,
        riskLevel: "high",
        findingCounts: {
          low: 0,
          medium: 1,
          high: 1
        }
      }
    },
    testAudit: {
      status: "weak",
      summary: "Changed tests do not prove the real path.",
      evidenceMode: "heuristic_only",
      evidenceSummary: "No runtime coverage artifact was found. Test audit remains heuristic-only.",
      changedSourceFiles: ["src/api/imu.ts"],
      changedTestFiles: ["src/api/imu.test.ts"],
      missingTestFindings: [],
      weakTestFindings: [
        {
          ruleId: "mocked-changed-source",
          title: "Changed source is mocked by test",
          description: "The test mocks the changed API boundary.",
          severity: "medium",
          category: "coverage",
          file: "src/api/imu.test.ts",
          line: 3
        }
      ],
      recommendedChecks: ["Add API-level IMU regression test."],
      runtimeCoverage: [],
      proofMap: {
        summary: {
          total: 1,
          provenByRuntimeCoverage: 0,
          referencedOnlyStatically: 0,
          weakenedByMocking: 1,
          unproven: 0
        },
        entries: [
          {
            file: "src/api/imu.ts",
            symbol: "submitImu",
            line: 10,
            status: "weakened_by_mocking",
            evidence: "weak-mock",
            proof: "deterministic",
            staticReferences: ["src/api/imu.test.ts"],
            routeFiles: ["src/api/imu.ts"],
            weakenedByMocks: ["src/api/imu.test.ts"],
            reasons: ["Static test references mock the changed boundary in src/api/imu.test.ts."],
            repairTask: "Add an integration test that reaches src/api/imu.ts#submitImu without mocking submitImu."
          }
        ]
      }
    },
    weakTestFindings: [
      {
        ruleId: "mocked-changed-source",
        title: "Changed source is mocked by test",
        description: "The test mocks the changed API boundary.",
        severity: "medium",
        category: "coverage",
        file: "src/api/imu.test.ts",
        line: 3
      }
    ],
    edgeCases: ["Exercise malformed IMU payloads through the real API route."],
    configuredChecks: [
      {
        kind: "test",
        name: "Test command 1",
        command: "pnpm test imu",
        willRun: false
      }
    ],
    toolAdapterPlans: [
      {
        kind: "playwright",
        name: "Playwright",
        command: "pnpm exec playwright test",
        capabilities: ["browser-flow"],
        willRun: false,
        requiresApproval: true
      }
    ],
    patternInsights: [],
    verification: {
      status: "not-run",
      commandsExecuted: false,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      timedOut: 0,
      errors: 0,
      durationMs: 0,
      checks: [],
      notes: ["Configured execution checks were not requested for this redteam report."]
    },
    memory: {
      flows: 1,
      commands: 0,
      invariants: 1,
      architecture: 0,
      regressions: 0
    },
    skills: [
      {
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        path: ".agents/skills/pr-red-team/SKILL.md",
        summary: "Find missed PR risks.",
        untrusted: true
      }
    ],
    fixTasks: [
      {
        title: "Investigate changed source is mocked",
        priority: "medium",
        source: "weak-test",
        proof: "missing-proof",
        detail: "Replace mocked test with a real route check.",
        file: "src/api/imu.test.ts",
        line: 3
      },
      {
        title: "Add or run an edge-case check",
        priority: "high",
        source: "edge-case",
        proof: "missing-proof",
        detail: "Exercise malformed IMU payloads through the real API route."
      }
    ],
    safety: {
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false,
      notes: []
    }
  };
}
