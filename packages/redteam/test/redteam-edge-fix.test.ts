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
