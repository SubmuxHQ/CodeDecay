import { describe, expect, it } from "vitest";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import { createAnalysisReport, type AnalyzerResult, type FileChange } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, weakTestRuleIds } from "../src/index";
import { summarizeMemory, summarizeSkills } from "../src/context";
import { suggestEdgeCases } from "../src/edge-cases";
import { createFixTasks } from "../src/fix-tasks";
import { createRedteamSafetySummary } from "../src/safety";

describe("redteam report", () => {
  it("assembles deterministic merge-safety evidence", () => {
    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      skills: createFixtureSkills(),
      configSource: "/repo/.codedecay/config.yml",
      memorySource: "/repo/.codedecay/memory.json",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(report.tool).toBe("CodeDecay");
    expect(report.mode).toBe("deterministic");
    expect(report.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(report.summary).toMatchObject({
      riskLevel: "medium",
      changedFiles: 2,
      impactedRoutes: 1,
      missingTestFindings: 0,
      weakTestFindings: 1,
      testProofStatus: "weak",
      configuredChecks: 2,
      toolAdapters: 3,
      productFailureBundles: 1,
      skills: 1
    });
    expect(Object.values(report.safety).filter((value) => value === false)).toHaveLength(4);
    expect(report.weakTestFindings.map((finding) => finding.ruleId)).toEqual(["test-without-assertions"]);
    expect(report.testAudit).toMatchObject({
      status: "weak",
      changedSourceFiles: ["src/auth/session.ts"],
      changedTestFiles: ["src/auth/session.test.ts"]
    });
    expect(report.edgeCases).toContain("Check missing, expired, malformed, and privilege-escalation credentials.");
    expect(report.edgeCases).toContain("Add an API-level session regression test");
    expect(report.edgeCases).toContain(
      "Run or strengthen src/auth/session.test.ts with negative, malformed, boundary, or integration coverage."
    );
    expect(report.edgeCases).not.toContain("src/auth/session.test.ts");
    expect(report.configuredChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "test", command: "pnpm test", willRun: false }),
        expect.objectContaining({ kind: "probe", command: "node probe.js", willRun: false })
      ])
    );
    expect(report.toolAdapterPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          command: "pnpm exec playwright test",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "schemathesis",
          command: "st run docs/openapi.yaml --url http://127.0.0.1:4000",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "pact",
          command: "pnpm run pact:verify",
          willRun: false,
          requiresApproval: false
        })
      ])
    );
    expect(report.skills).toEqual([
      {
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        path: ".agents/skills/pr-red-team/SKILL.md",
        summary: "Find missed PR risks.",
        untrusted: true
      }
    ]);
    expect(report.fixTasks.map((task) => task.title)).toEqual(
      expect.arrayContaining([
        "Add auth negative-path proof",
        "Exercise the real API boundary",
        "Strengthen test proof",
        "Verify invariant: Auth fails closed",
        "Re-check past regression: Anonymous admin",
        "Consider running Playwright harness",
        "Fix product failure: Session API invalid-token regression",
        "Review with skill: PR Red-Team Skill"
      ])
    );
  });

  it("renders JSON and Markdown", () => {
    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      skills: createFixtureSkills(),
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    const json = JSON.parse(renderRedteamReport(report, "json"));
    expect(json.tool).toBe("CodeDecay");
    expect(json.mode).toBe("deterministic");
    expect(json.summary.impactedRoutes).toBe(1);
    expect(json.summary.missingTestFindings).toBe(0);
    expect(json.summary.productFailureBundles).toBe(1);
    expect(json.analysis.impactedRoutes[0]).toMatchObject({
      framework: "nextjs",
      kind: "api-route",
      route: "/api/session"
    });

    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("## CodeDecay Redteam Report");
    expect(markdown).toContain("### Test Evidence Audit");
    expect(markdown).toContain("### Product Verification Failures");
    expect(markdown).toContain("Session API invalid-token regression");
    expect(markdown).toContain("Rerun: `npx codedecay product run --check api.session.invalid-token`");
    expect(markdown).toContain("| Missing-test findings | 0 |");
    expect(markdown).toContain("**Status:** Weak");
    expect(markdown).toContain("### Agent Skills");
    expect(markdown).toContain("### Likely Impacted Routes And APIs");
    expect(markdown).toContain("High `GET /api/session` (Next.js API route)");
    expect(markdown).toContain("Add an API-level session regression test");
    expect(markdown).toContain("### Tool Adapter Plans");
    expect(markdown).toContain("Playwright");
    expect(markdown).toContain("Schemathesis");
    expect(markdown).toContain("PR Red-Team Skill");
    expect(markdown).toContain("Commands executed: no");
    expect(markdown).toContain("LLM/model called: no");
  });

  it("exports weak-test rule ids for integrations", () => {
    expect(weakTestRuleIds()).toContain("test-without-assertions");
    expect(weakTestRuleIds()).toEqual([...weakTestRuleIds()].sort((left, right) => left.localeCompare(right)));
  });

  it("keeps report-only safety flags explicit", () => {
    expect(createRedteamSafetySummary()).toEqual({
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false,
      notes: [
        "codedecay redteam is report-only in this MVP.",
        "No configured commands, probes, tool adapters, LLM providers, hosted services, or memory providers are executed.",
        "Use codedecay execute or codedecay differential explicitly when you want configured local checks to run."
      ]
    });
  });

  it("summarizes memory and skills as local untrusted context", () => {
    expect(summarizeMemory(createFixtureMemory(), "/repo/.codedecay/memory.json")).toEqual({
      flows: 1,
      commands: 0,
      invariants: 1,
      architecture: 0,
      regressions: 1,
      sourcePath: "/repo/.codedecay/memory.json"
    });
    expect(summarizeMemory(createFixtureMemory(), undefined)).not.toHaveProperty("sourcePath");
    expect(summarizeSkills(createFixtureSkills())).toEqual([
      {
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        path: ".agents/skills/pr-red-team/SKILL.md",
        summary: "Find missed PR risks.",
        untrusted: true
      }
    ]);
    expect(summarizeSkills(undefined)).toEqual([]);
  });

  it("suggests deterministic edge cases from impacted areas and recommended tests", () => {
    expect(suggestEdgeCases(createFixtureAnalysisReport())).toEqual(
      expect.arrayContaining([
        "Check missing, expired, malformed, and privilege-escalation credentials.",
        "Check whether changed tests exercise real production boundaries or only mocked helper logic.",
        "Run or strengthen src/auth/session.test.ts with negative, malformed, boundary, or integration coverage."
      ])
    );
    expect(
      suggestEdgeCases(
        createAnalysisReport({
          changedFiles: [],
          analyzerResult: {
            impactedAreas: [],
            findings: [],
            recommendedTests: []
          },
          generatedAt: "2026-01-01T00:00:00.000Z"
        })
      )
    ).toEqual(["Run the relevant unit, integration, and smoke checks for changed packages."]);
  });

  it("creates deterministic fix tasks for weak tests and deduped edge cases", () => {
    const tasks = createFixTasks({
      analysisReport: createFixtureAnalysisReport(),
      weakTestFindings: [],
      edgeCases: [
        "Check missing, expired, malformed, and privilege-escalation credentials.",
        "Check missing, expired, malformed, and privilege-escalation credentials."
      ],
      configuredChecks: [],
      toolAdapterPlans: [],
      memory: createEmptyMemory(),
      skills: []
    });

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Investigate Changed test has no assertions",
          source: "weak-test",
          priority: "medium"
        }),
        expect.objectContaining({
          title: "Add auth negative-path proof",
          source: "edge-case",
          priority: "high"
        })
      ])
    );
    expect(tasks.filter((task) => task.title === "Add auth negative-path proof")).toHaveLength(1);
  });

  it("summarizes missing-test findings separately from weak-test findings", () => {
    const report = createRedteamReport({
      analysisReport: createAnalysisReport({
        changedFiles: [
          {
            path: "src/api/users.ts",
            status: "modified",
            additions: 4,
            deletions: 1,
            addedLines: [{ line: 2, content: "return Response.json({ ok: true });" }]
          }
        ],
        analyzerResult: {
          impactedAreas: [
            {
              name: "API surface",
              kind: "api",
              risk: "high",
              files: ["src/api/users.ts"]
            }
          ],
          findings: [
            {
              ruleId: "missing-nearby-tests",
              title: "Risky source changes without changed tests",
              description: "API behavior changed without nearby test proof.",
              severity: "high",
              category: "coverage",
              file: "src/api/users.ts",
              line: 2
            }
          ],
          recommendedTests: ["Add or run tests covering src/api/users.ts"]
        },
        generatedAt: "2026-01-01T00:00:00.000Z"
      }),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      generatedAt: "2026-01-01T00:00:00.000Z"
    });
    const markdown = renderRedteamReport(report, "markdown");

    expect(report.summary.missingTestFindings).toBe(1);
    expect(report.summary.weakTestFindings).toBe(0);
    expect(report.testAudit.status).toBe("missing");
    expect(markdown).toContain("| Missing-test findings | 1 |");
    expect(markdown).toContain("| Weak-test findings | 0 |");
  });
});

function createFixtureAnalysisReport() {
  return createAnalysisReport({
    base: "main",
    head: "HEAD",
    changedFiles: createFixtureChangedFiles(),
    analyzerResult: createFixtureAnalyzerResult(),
    productFailureBundles: [
      {
        schemaVersion: 1,
        id: "api-session-invalid-token",
        checkId: "api.session.invalid-token",
        checkKind: "api",
        priority: "high",
        target: {
          id: "api",
          baseUrl: "http://127.0.0.1:3000"
        },
        title: "Session API invalid-token regression",
        summary: "Invalid tokens now return 500 instead of 401.",
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
            path: ".codedecay/artifacts/api-session.diff"
          }
        ],
        expected: "401 JSON error",
        actual: "500 HTML error",
        impactedFiles: ["src/auth/session.ts"],
        suggestedFixTasks: ["Restore invalid-token handling."],
        rerunCommand: "npx codedecay product run --check api.session.invalid-token"
      }
    ],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });
}

function createFixtureChangedFiles(): FileChange[] {
  return [
    {
      path: "src/auth/session.ts",
      status: "modified",
      additions: 8,
      deletions: 2,
      addedLines: [{ line: 2, content: "return { role: 'admin' };" }]
    },
    {
      path: "src/auth/session.test.ts",
      status: "modified",
      additions: 4,
      deletions: 1,
      addedLines: [{ line: 3, content: "validateSession('token');" }]
    }
  ];
}

function createFixtureAnalyzerResult(): AnalyzerResult {
  return {
    impactedAreas: [
      {
        name: "Authentication and session management",
        kind: "auth",
        risk: "high",
        files: ["src/auth/session.ts"]
      },
      {
        name: "Tests",
        kind: "test",
        risk: "medium",
        files: ["src/auth/session.test.ts"]
      }
    ],
    impactedRoutes: [
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/session",
        methods: ["GET"],
        files: ["src/auth/session.ts"],
        risk: "high",
        reasons: ["Protected session API route changed"],
        recommendedTests: ["Add an API-level session regression test"]
      }
    ],
    findings: [
      {
        ruleId: "auth-session-risk",
        title: "Auth/session boundary changed",
        description: "Authentication behavior changed and may affect protected routes.",
        severity: "high",
        category: "regression",
        file: "src/auth/session.ts",
        line: 2
      },
      {
        ruleId: "test-without-assertions",
        title: "Changed test has no assertions",
        description: "Test calls production code but does not assert the behavior.",
        severity: "medium",
        category: "coverage",
        file: "src/auth/session.test.ts",
        line: 3
      }
    ],
    recommendedTests: ["Add assertion for missing token session handling", "src/auth/session.test.ts"]
  };
}

function createFixtureConfig(): CodeDecayConfig {
  return {
    version: 1,
    commands: {
      test: ["pnpm test"],
      build: [],
      start: []
    },
    probes: [{ name: "session probe", command: "node probe.js", timeoutMs: 1000 }],
    safety: {
      commandTimeoutMs: 120000,
      allowCommands: true
    },
    llm: {
      provider: "disabled",
      timeoutMs: 30000
    },
    toolAdapters: {
      playwright: {
        enabled: true
      },
      stryker: {
        enabled: false
      },
      schemathesis: {
        enabled: true,
        schema: "docs/openapi.yaml",
        baseUrl: "http://127.0.0.1:4000"
      },
      pact: {
        enabled: true,
        command: "pnpm run pact:verify"
      }
    },
    productTesting: {
      targets: {}
    }
  };
}

function createFixtureMemory(): CodeDecayMemory {
  return {
    version: 1,
    flows: [{ name: "Login flow", areas: ["auth"], checks: ["missing token"] }],
    commands: [],
    invariants: [
      {
        name: "Auth fails closed",
        description: "Anonymous users must never become admins.",
        severity: "high",
        areas: ["auth"]
      }
    ],
    architecture: [],
    regressions: [
      {
        title: "Anonymous admin",
        description: "A missing token previously created an admin session.",
        check: "request protected route without token"
      }
    ]
  };
}

function createEmptyMemory(): CodeDecayMemory {
  return {
    version: 1,
    flows: [],
    commands: [],
    invariants: [],
    architecture: [],
    regressions: []
  };
}

function createFixtureSkills() {
  return {
    sourceDir: "/repo/.agents/skills",
    skills: [
      {
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        path: ".agents/skills/pr-red-team/SKILL.md",
        summary: "Find missed PR risks.",
        content: "# PR Red-Team Skill\n\nFind missed PR risks.\n",
        untrusted: true as const
      }
    ]
  };
}
