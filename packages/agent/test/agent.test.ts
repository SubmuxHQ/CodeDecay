import { describe, expect, it } from "vitest";
import { createAgentTaskBundle, renderAgentTaskBundle } from "../src/index";
import type { RedteamReport } from "@submuxhq/codedecay-redteam";

describe("agent task bundles", () => {
  it("creates an agent-facing bundle from redteam evidence", () => {
    const bundle = createAgentTaskBundle(createFixtureReport());

    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high",
        weakTestFindings: 1,
        fixTasks: 2
      },
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(bundle.purpose).toContain("Codex");
    expect(bundle.prompt).toContain("CodeDecay agent task bundle");
    expect(bundle.prompt).toContain("Current CodeDecay risk is High");
    expect(bundle.prompt).toContain("did not call an LLM");
    expect(bundle.evidence.changedFiles).toEqual([{ path: "src/api/imu.ts", status: "modified" }]);
    expect(bundle.evidence.weakTestFindings[0]?.ruleId).toBe("mocked-changed-source");
    expect(bundle.suggestedChecks).toEqual([
      {
        source: "configured-command",
        name: "Test command 1",
        kind: "test",
        command: "pnpm test imu",
        willRun: false
      },
      {
        source: "tool-adapter",
        name: "Playwright",
        kind: "playwright",
        command: "pnpm exec playwright test",
        willRun: false
      }
    ]);
  });

  it("renders markdown for user-owned coding agents", () => {
    const markdown = renderAgentTaskBundle(createAgentTaskBundle(createFixtureReport()), "markdown");

    expect(markdown).toContain("## CodeDecay Agent Task Bundle");
    expect(markdown).toContain("Give this bundle to a user-owned coding agent");
    expect(markdown).toContain("### Copy-Paste Prompt");
    expect(markdown).toContain("You are helping fix a pull request using a CodeDecay agent task bundle.");
    expect(markdown).toContain("### Tool Evidence");
    expect(markdown).toContain("### Tasks To Complete");
    expect(markdown).toContain("LLM/model called by CodeDecay: no");
    expect(markdown).toContain("This bundle reduces missed-review risk; it does not guarantee a safe merge.");
  });

  it("renders JSON", () => {
    const json = renderAgentTaskBundle(createAgentTaskBundle(createFixtureReport()), "json");
    const parsed = JSON.parse(json);

    expect(parsed.mode).toBe("agent-task-bundle");
    expect(parsed.prompt).toContain("Current CodeDecay risk is High");
    expect(parsed.instructions).toContain("Do not assume the PR is safe just because tests pass.");
  });
});

function createFixtureReport(): RedteamReport {
  return {
    tool: "CodeDecay",
    version: "0.1.3",
    generatedAt: "2026-06-24T00:00:00.000Z",
    mode: "deterministic",
    summary: {
      mergeRiskScore: 88,
      decayScore: 42,
      riskLevel: "high",
      changedFiles: 1,
      impactedAreas: 1,
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
      skills: 1,
      fixTasks: 2
    },
    analysis: {
      tool: "CodeDecay",
      version: "0.1.3",
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
      findings: [],
      recommendedTests: [],
      summary: {
        mergeRiskScore: 88,
        decayScore: 42,
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
      recommendedChecks: ["Add API-level IMU regression test."]
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
        detail: "Replace mocked test with a real route check.",
        file: "src/api/imu.test.ts",
        line: 3
      },
      {
        title: "Add or run an edge-case check",
        priority: "high",
        source: "edge-case",
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
