import { describe, expect, it } from "vitest";
import { createAgentTaskBundle, listAgentProfiles, renderAgentTaskBundle } from "../src/index";
import { createFixtureReport } from "./helpers/agent";

describe("agent task bundle rendering", () => {
  it("renders markdown for user-owned coding agents", () => {
    const markdown = renderAgentTaskBundle(createAgentTaskBundle(createFixtureReport()), "markdown");

    expect(markdown).toContain("## CodeDecay Agent Task Bundle");
    expect(markdown).toContain("Give this bundle to a user-owned coding agent");
    expect(markdown).toContain("Start from impacted routes/APIs when present");
    expect(markdown).toContain("| Missing-test findings | 0 |");
    expect(markdown).toContain("| Product failure bundles | 1 |");
    expect(markdown).toContain("### Agent Handoff");
    expect(markdown).toContain("Generic user-owned agent");
    expect(markdown).toContain("### Copy-Paste Prompt");
    expect(markdown).toContain("You are helping fix a pull request using a CodeDecay agent task bundle.");
    expect(markdown).toContain("### Tool Evidence");
    expect(markdown).toContain("Impacted routes and APIs:");
    expect(markdown).toContain("High `POST /api/imu` (Express route handler)");
    expect(markdown).toContain("Product failure bundles:");
    expect(markdown).toContain("IMU submit flow fails");
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
    expect(parsed.summary.productFailureBundles).toBe(1);
    expect(parsed.prompt).toContain("For each route/API impact");
    expect(parsed.instructions).toContain("Do not assume the PR is safe just because tests pass.");
    expect(parsed.evidence.impactedRoutes[0]).toMatchObject({
      framework: "express",
      route: "/api/imu",
      methods: ["POST"]
    });
  });
});
