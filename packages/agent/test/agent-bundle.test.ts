import { describe, expect, it } from "vitest";
import { createAgentTaskBundle, listAgentProfiles, renderAgentTaskBundle } from "../src/index";
import { createFixtureReport } from "./helpers/agent";

describe("agent task bundle creation", () => {
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
        productFailureBundles: 1,
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
    expect(bundle.prompt).toContain("1 product failure bundles");
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
    expect(bundle.evidence.productFailureBundles[0]).toMatchObject({
      id: "ui-imu-submit",
      checkId: "ui.imu.submit",
      priority: "high"
    });
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
