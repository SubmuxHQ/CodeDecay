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
});
