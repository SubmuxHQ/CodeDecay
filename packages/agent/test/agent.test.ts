import { describe, expect, it } from "vitest";
import { createAgentTaskBundle, listAgentProfiles, renderAgentTaskBundle } from "../src/index";
import type { RedteamReport } from "@submuxhq/codedecay-redteam";

describe("agent task bundles", () => {
  it("creates an agent-facing bundle from redteam evidence", () => {
    const bundle = createAgentTaskBundle(createFixtureReport());

    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high",
        impactedRoutes: 1,
        missingTestFindings: 0,
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
    expect(bundle.agentProfile).toMatchObject({
      id: "generic",
      name: "Generic user-owned agent"
    });
    expect(bundle.prompt).toContain("CodeDecay agent task bundle");
    expect(bundle.prompt).toContain("Target agent profile: Generic user-owned agent");
    expect(bundle.prompt).toContain("Current CodeDecay risk is High");
    expect(bundle.prompt).toContain("1 route/API impacts");
    expect(bundle.prompt).toContain("0 missing-test findings");
    expect(bundle.prompt).toContain("Start with impacted routes/APIs when present");
    expect(bundle.instructions).toContain(
      "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings."
    );
    expect(bundle.prompt).toContain("did not call an LLM");
    expect(bundle.evidence.changedFiles).toEqual([{ path: "src/api/imu.ts", status: "modified" }]);
    expect(bundle.evidence.impactedRoutes).toEqual([
      {
        framework: "express",
        kind: "route-handler",
        route: "/api/imu",
        methods: ["POST"],
        risk: "high",
        files: ["src/api/imu.ts"],
        reasons: ["IMU ingestion route changed"],
        recommendedTests: ["Add API-level IMU regression test."]
      }
    ]);
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
    expect(markdown).toContain("Start from impacted routes/APIs when present");
    expect(markdown).toContain("| Missing-test findings | 0 |");
    expect(markdown).toContain("### Agent Handoff");
    expect(markdown).toContain("Generic user-owned agent");
    expect(markdown).toContain("### Copy-Paste Prompt");
    expect(markdown).toContain("You are helping fix a pull request using a CodeDecay agent task bundle.");
    expect(markdown).toContain("### Tool Evidence");
    expect(markdown).toContain("Impacted routes and APIs:");
    expect(markdown).toContain("High `POST /api/imu` (Express route handler)");
    expect(markdown).toContain("### Tasks To Complete");
    expect(markdown).toContain("LLM/model called by CodeDecay: no");
    expect(markdown).toContain("This bundle reduces missed-review risk; it does not guarantee a safe merge.");
  });

  it("renders JSON", () => {
    const json = renderAgentTaskBundle(createAgentTaskBundle(createFixtureReport()), "json");
    const parsed = JSON.parse(json);

    expect(parsed.mode).toBe("agent-task-bundle");
    expect(parsed.agentProfile.id).toBe("generic");
    expect(parsed.prompt).toContain("Current CodeDecay risk is High");
    expect(parsed.summary.missingTestFindings).toBe(0);
    expect(parsed.prompt).toContain("For each route/API impact");
    expect(parsed.instructions).toContain("Do not assume the PR is safe just because tests pass.");
    expect(parsed.evidence.impactedRoutes[0]).toMatchObject({
      framework: "express",
      route: "/api/imu",
      methods: ["POST"]
    });
  });

  it("creates profile-specific handoff guidance without changing safety guarantees", () => {
    const bundle = createAgentTaskBundle(createFixtureReport(), { profile: "codex" });
    const markdown = renderAgentTaskBundle(bundle, "markdown");

    expect(listAgentProfiles().map((profile) => profile.id)).toEqual([
      "generic",
      "codex",
      "claude-code",
      "cursor",
      "pi",
      "opencode",
      "desktop"
    ]);
    expect(bundle.agentProfile).toMatchObject({
      id: "codex",
      name: "Codex"
    });
    expect(bundle.prompt).toContain("Target agent profile: Codex");
    expect(markdown).toContain("### Agent Handoff");
    expect(markdown).toContain("Paste the prompt and bundle into the Codex repo session.");
    expect(bundle.safety).toMatchObject({
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("creates Pi and OpenCode handoff guidance without calling those agents", () => {
    const piBundle = createAgentTaskBundle(createFixtureReport(), { profile: "pi" });
    const opencodeBundle = createAgentTaskBundle(createFixtureReport(), { profile: "opencode" });

    expect(piBundle.agentProfile).toMatchObject({
      id: "pi",
      name: "Pi"
    });
    expect(piBundle.prompt).toContain("Target agent profile: Pi");
    expect(piBundle.agentProfile.handoff).toContain(
      "Attach or paste the prompt and bundle into the Pi harness workflow."
    );
    expect(opencodeBundle.agentProfile).toMatchObject({
      id: "opencode",
      name: "OpenCode"
    });
    expect(opencodeBundle.prompt).toContain("Target agent profile: OpenCode");
    expect(opencodeBundle.agentProfile.handoff).toContain("Paste the prompt and bundle into OpenCode.");
    expect(piBundle.safety).toMatchObject({
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      agentOutputTrusted: false
    });
    expect(opencodeBundle.safety).toMatchObject(piBundle.safety);
  });
});

function createFixtureReport(): RedteamReport {
  return {
    tool: "CodeDecay",
    version: "0.1.4",
    generatedAt: "2026-06-24T00:00:00.000Z",
    mode: "deterministic",
    summary: {
      mergeRiskScore: 88,
      decayScore: 42,
      riskLevel: "high",
      changedFiles: 1,
      impactedAreas: 1,
      impactedRoutes: 1,
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
      skills: 1,
      fixTasks: 2
    },
    analysis: {
      tool: "CodeDecay",
      version: "0.1.4",
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
