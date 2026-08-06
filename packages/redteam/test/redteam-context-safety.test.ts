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

describe("redteam context and safety summaries", () => {
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
        "codedecay redteam is report-only unless --with-checks is explicitly requested.",
        "No configured commands, probes, tool adapters, LLM providers, hosted services, or external memory providers are executed.",
        "Use codedecay redteam --with-checks, codedecay execute, or codedecay differential explicitly when you want configured local checks to run."
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
      learningEvents: 0,
      sourcePath: "/repo/.codedecay/memory.json"
    });
    expect(summarizeMemory(createFixtureMemory(), undefined)).not.toHaveProperty("sourcePath");
    expect(summarizeMemory(createFixtureMemory(), "/repo/.codedecay/memory.json", [
      {
        provider: "local",
        kind: "local",
        status: "loaded",
        sourcePath: "/repo/.codedecay/memory.json",
        untrusted: true
      },
      {
        provider: "mem0",
        kind: "external",
        status: "failed",
        error: "missing key",
        untrusted: true
      }
    ])).toMatchObject({
      providerSources: [
        expect.objectContaining({ provider: "local", status: "loaded", untrusted: true }),
        expect.objectContaining({ provider: "mem0", status: "failed", untrusted: true })
      ],
      providerFailures: [
        expect.objectContaining({ provider: "mem0", status: "failed", error: "missing key" })
      ]
    });
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

  it("reports when approved learnings influence proof planning", () => {
    const memory = {
      ...createFixtureMemory(),
      learningEvents: [
        {
          id: "learn_payout",
          schemaVersion: 1 as const,
          kind: "confirmed-regression" as const,
          title: "Payout retry idempotency regression",
          summary: "Duplicate retry keys paid twice.",
          invariant: "A payout retry key must settle at most once.",
          proofRecipe: "Run the retry integration test against the real API route.",
          sourceEvidenceIds: ["check:payout-retry"],
          scope: { files: ["src/auth/session.ts"] },
          confidence: 0.9,
          trustClass: "human-approved" as const,
          creator: "kunal",
          createdAt: "2026-08-01T10:00:00.000Z",
          reviewStatus: "approved" as const,
          auditTrail: [
            {
              action: "approve" as const,
              actor: "kunal",
              timestamp: "2026-08-01T11:00:00.000Z",
              reason: "Verified"
            }
          ]
        }
      ]
    };

    const summary = summarizeMemory(memory, "/repo/.codedecay/memory.json", [], {
      changedFiles: createFixtureAnalysisReport().changedFiles,
      impactedAreas: createFixtureAnalysisReport().impactedAreas
    });

    expect(summary.learningEvents).toBe(1);
    expect(summary.approvedLearningsApplied).toBe(1);
    expect(summary.learningInfluences?.[0]).toContain(
      "Prior learning influenced proof planning: Payout retry idempotency regression"
    );

    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory,
      memorySource: "/repo/.codedecay/memory.json",
      skills: createFixtureSkills()
    });
    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("| Approved learnings applied | 1 |");
    expect(markdown).toContain("Prior learning influenced proof planning");
  });
});
