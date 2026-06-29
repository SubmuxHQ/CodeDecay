import { describe, expect, it } from "vitest";
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

describe("redteam report assembly and rendering", () => {
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
});
