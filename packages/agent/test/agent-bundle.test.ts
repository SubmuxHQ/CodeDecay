import { describe, expect, it } from "vitest";
import { createAgentTaskBundle, listAgentProfiles, renderAgentTaskBundle } from "../src/index";
import { createFixtureReport } from "./helpers/agent";

describe("agent task bundle creation", () => {
  it("preserves requirement evidence from redteam through the agent handoff", () => {
    const report = createFixtureReport();
    report.requirements = {
      schemaVersion: 1,
      confidence: "high",
      sources: [{ id: "issue-663", kind: "issue", label: "Issue #663" }],
      task: { text: "Add billing export", sourceIds: ["issue-663"] },
      currentBehavior: [],
      expectedBehavior: [],
      acceptanceCriteria: [{
        id: "AC-1",
        text: "Authorized users can export CSV.",
        requiredProof: ["Call the real export route."],
        sourceIds: ["issue-663"]
      }],
      nonGoals: [],
      affectedFlows: [{ name: "Billing export", kind: "api", sourceIds: ["issue-663"] }],
      invariants: [],
      architectureConstraints: [],
      unresolvedQuestions: []
    };

    const bundle = createAgentTaskBundle(report);
    const markdown = renderAgentTaskBundle(bundle, "markdown");

    expect(bundle.requirements?.acceptanceCriteria[0]?.id).toBe("AC-1");
    expect(markdown).toContain("### Requirement Evidence");
    expect(markdown).toContain("Call the real export route.");
    expect(markdown.indexOf("### Requirement Evidence")).toBeLessThan(markdown.indexOf("### Tool Evidence"));
  });

  it("creates an agent-facing bundle from redteam evidence", () => {
    const bundle = createAgentTaskBundle(createFixtureReport());

    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      summary: {
        riskLevel: "high",
        impactedRoutes: 1,
        testProofEntries: 1,
        missingTestFindings: 0,
        weakTestFindings: 1,
        productFailureBundles: 1,
        fixTasks: 2,
        verificationStatus: "not-run"
      },
      verification: {
        status: "not-run",
        commandsExecuted: false,
        checks: []
      }
    });
    expect(bundle.safety.llmCalled).toBe(false);
    expect(bundle.safety.commandsExecuted).toBe(false);
    expect(bundle.safety.telemetrySent).toBe(false);
    expect(bundle.safety.cloudDependency).toBe(false);
    expect(bundle.safety.agentOutputTrusted).toBe(false);
    expect(bundle.purpose).toContain("Codex");
    expect(bundle.agentProfile).toMatchObject({
      id: "generic",
      name: "Generic user-owned agent"
    });
    expect(bundle.prompt).toContain("CodeDecay agent task bundle");
    expect(bundle.prompt).toContain("Target agent profile: Generic user-owned agent");
    expect(bundle.prompt).toContain("Current CodeDecay risk is High");
    expect(bundle.prompt).toContain("1 route/API impacts");
    expect(bundle.prompt).toContain("1 changed-path proof entries");
    expect(bundle.prompt).toContain("0 missing-test findings");
    expect(bundle.prompt).toContain("1 product failure bundles");
    expect(bundle.prompt).toContain("verification status: not-run");
    expect(bundle.prompt).toContain("Start with impacted routes/APIs when present");
    expect(bundle.instructions).toContain(
      "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings."
    );
    expect(bundle.prompt).toContain("did not call an LLM");
    expect(bundle.limits).toContain("CodeDecay did not call an LLM/model to create this bundle.");
    expect(bundle.limits).toContain("CodeDecay did not execute commands while creating this bundle.");
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
    expect(bundle.evidence.testProofEntries[0]).toMatchObject({
      file: "src/api/imu.ts",
      symbol: "submitImu",
      status: "weakened_by_mocking"
    });
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

  it("preserves verification evidence and describes explicit execution honestly", () => {
    const report = createFixtureReport();
    report.summary.verificationStatus = "failed";
    report.verification = {
      status: "failed",
      commandsExecuted: true,
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      blocked: 0,
      timedOut: 0,
      errors: 0,
      durationMs: 42,
      checks: [{
        kind: "test",
        name: "API integration test",
        command: "pnpm test api",
        status: "failed",
        proof: "tool-evidence",
        summary: "The real API route returned 500.",
        durationMs: 42
      }],
      notes: ["The database migration path was not exercised."]
    };
    report.safety.commandsExecuted = true;
    report.safety.llmCalled = true;

    const bundle = createAgentTaskBundle(report, { profile: "codex" });
    const markdown = renderAgentTaskBundle(bundle, "markdown");

    expect(bundle.verification).toEqual(report.verification);
    expect(bundle.summary.verificationStatus).toBe("failed");
    expect(bundle.prompt).toContain("explicitly called the configured user-owned provider");
    expect(bundle.prompt).toContain("executed explicitly configured local checks");
    expect(bundle.prompt).not.toContain("did not call an LLM or model");
    expect(bundle.prompt).not.toContain("did not execute configured project commands");
    expect(bundle.limits).toContain(
      "CodeDecay explicitly called the configured user-owned provider; its suggestions remain untrusted."
    );
    expect(bundle.limits).toContain(
      "CodeDecay executed explicitly configured local checks through repository safety policy."
    );
    expect(bundle.limits).not.toContain("CodeDecay did not call an LLM/model to create this bundle.");
    expect(bundle.limits).not.toContain("CodeDecay did not execute commands while creating this bundle.");
    expect(markdown).toContain("| Verification status | failed |");
    expect(markdown).toContain("### Verification Evidence");
    expect(markdown).toContain("**API integration test** (test, failed, tool evidence)");
    expect(markdown).toContain("The real API route returned 500.");
    expect(markdown).toContain("The database migration path was not exercised.");
    expect(markdown).toContain("Commands executed by CodeDecay: yes");
    expect(markdown).toContain(
      "CodeDecay executed explicitly configured local checks through repository safety policy."
    );
    expect(markdown).not.toContain("CodeDecay did not execute commands while creating this bundle.");
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
    expect(piBundle.safety.llmCalled).toBe(false);
    expect(piBundle.safety.commandsExecuted).toBe(false);
    expect(piBundle.safety.telemetrySent).toBe(false);
    expect(piBundle.safety.cloudDependency).toBe(false);
    expect(piBundle.safety.agentOutputTrusted).toBe(false);
    expect(opencodeBundle.safety).toEqual(piBundle.safety);
  });
});
