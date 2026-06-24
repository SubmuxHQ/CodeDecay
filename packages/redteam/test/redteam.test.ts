import { describe, expect, it } from "vitest";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import { createAnalysisReport, type AnalyzerResult, type FileChange } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, weakTestRuleIds } from "../src/index";

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
      weakTestFindings: 1,
      testProofStatus: "weak",
      configuredChecks: 2,
      toolAdapters: 3,
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
        "Verify invariant: Auth fails closed",
        "Re-check past regression: Anonymous admin",
        "Consider running Playwright harness",
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

    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("## CodeDecay Redteam Report");
    expect(markdown).toContain("### Test Proof Audit");
    expect(markdown).toContain("**Status:** Weak");
    expect(markdown).toContain("### Agent Skills");
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
});

function createFixtureAnalysisReport() {
  return createAnalysisReport({
    base: "main",
    head: "HEAD",
    changedFiles: createFixtureChangedFiles(),
    analyzerResult: createFixtureAnalyzerResult(),
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
    recommendedTests: ["Add assertion for missing token session handling"]
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
