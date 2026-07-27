import { describe, expect, it } from "vitest";
import { createAnalysisReport } from "@submuxhq/codedecay-core";
import { createRedteamReport, renderRedteamReport, weakTestRuleIds } from "../src/index";
import { summarizeMemory, summarizeSkills } from "../src/context";
import { suggestEdgeCases } from "../src/edge-cases";
import { createFixTasks } from "../src/fix-tasks";
import { createRedteamSafetySummary } from "../src/safety";
import {
  createEmptyMemory,
  createFixtureAnalysisReport,
  createFixtureConfig,
  createFixtureMemory,
  createFixtureSkills
} from "./helpers/redteam";

describe("redteam edge cases and fix tasks", () => {
  it("suggests structured scenarios without promoting recommended test chores", () => {
    const scenarios = suggestEdgeCases(createFixtureAnalysisReport());

    expect(scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "auth-fail-closed",
          trigger: expect.stringMatching(/missing.*expired.*lower-privilege/i)
        })
      ])
    );
    expect(scenarios.map((scenario) => scenario.title).join("\n")).not.toContain("src/auth/session.test.ts");
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
    ).toEqual([]);
  });

  it("creates deterministic fix tasks for weak tests and deduped edge cases", () => {
    const authScenario = suggestEdgeCases(createFixtureAnalysisReport())
      .find((scenario) => scenario.id === "auth-fail-closed");
    expect(authScenario).toBeDefined();
    const tasks = createFixTasks({
      analysisReport: createFixtureAnalysisReport(),
      weakTestFindings: [],
      edgeCases: authScenario ? [authScenario, authScenario] : [],
      configuredChecks: [],
      toolAdapterPlans: [],
      patternInsights: [],
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
          title: "Keep GET /api/session closed to unauthorized credentials",
          source: "edge-case",
          priority: "high"
        })
      ])
    );
    expect(
      tasks.filter((task) => task.title === "Keep GET /api/session closed to unauthorized credentials")
    ).toHaveLength(1);
  });

  it("labels static security findings as deterministic signals, not tool proof", () => {
    const analysisReport = createAnalysisReport({
      changedFiles: [
        {
          path: "src/api/search.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          addedLines: [{ line: 3, content: "db.query(`select * from users where name = ${q}`);" }]
        }
      ],
      analyzerResult: {
        impactedAreas: [
          {
            name: "API surface",
            kind: "api",
            risk: "high",
            files: ["src/api/search.ts"]
          }
        ],
        findings: [
          {
            ruleId: "security-sql-injection",
            title: "SQL injection candidate",
            description: "Dynamic query construction is present near request-controlled input.",
            severity: "high",
            category: "security",
            file: "src/api/search.ts",
            line: 3
          }
        ],
        recommendedTests: []
      },
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    const tasks = createFixTasks({
      analysisReport,
      weakTestFindings: [],
      edgeCases: [],
      configuredChecks: [],
      toolAdapterPlans: [],
      patternInsights: [],
      memory: createEmptyMemory(),
      skills: []
    });

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Investigate SQL injection candidate",
          source: "finding",
          proof: "deterministic-signal"
        })
      ])
    );
  });

  it("labels memory-derived findings as untrusted memory context", () => {
    const analysisReport = createAnalysisReport({
      changedFiles: [
        {
          path: "src/service.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          addedLines: [{ line: 2, content: "return input;" }]
        }
      ],
      analyzerResult: {
        impactedAreas: [],
        findings: [
          {
            ruleId: "memory-invariant-impacted",
            title: "Project invariant may be impacted",
            description: "Untrusted memory context: an editable invariant matched.",
            severity: "high",
            category: "regression",
            file: "src/service.ts",
            line: 2
          }
        ],
        recommendedTests: ["Verify invariant: Editable invariant"]
      },
      generatedAt: "2026-07-23T00:00:00.000Z"
    });

    const tasks = createFixTasks({
      analysisReport,
      weakTestFindings: [],
      edgeCases: [],
      configuredChecks: [],
      toolAdapterPlans: [],
      patternInsights: [],
      memory: createEmptyMemory(),
      skills: []
    });

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Investigate Project invariant may be impacted",
          source: "memory",
          proof: "memory-context"
        })
      ])
    );
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
