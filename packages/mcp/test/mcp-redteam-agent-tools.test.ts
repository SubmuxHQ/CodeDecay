import { describe, expect, it } from "vitest";
import {
  createCodeDecayMcpServer,
  runAnalyzePrTool,
  runAgentTaskBundleTool,
  runAuditTestsTool,
  runExecuteConfiguredChecksTool,
  runImpactMapTool,
  runProductFailuresTool,
  runProductPlanTool,
  runProductRerunTool,
  runProductRunTool,
  runRedteamReportTool,
  runSuggestEdgeCasesTool
} from "../src/index";
import {
  createExecutionRepo,
  createMissingTestRepo,
  createProductRepo,
  createRouteImpactRepo,
  createTempDir,
  createWeakTestRepo,
  marker,
  productMarker,
  writeFakeProductCli,
  writeFile
} from "./helpers/mcp";

describe("CodeDecay MCP redteam and agent tools", () => {
  it("returns route impact evidence through MCP redteam and agent tools", () => {
    const repo = createRouteImpactRepo();

    const redteam = JSON.parse(runRedteamReportTool({ cwd: repo }, { format: "json" }));
    const agent = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json", profile: "codex" }));

    expect(redteam.summary.impactedRoutes).toBe(2);
    expect(redteam.analysis.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users"
        })
      ])
    );
    expect(agent.summary.impactedRoutes).toBe(2);
    expect(agent.evidence.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users"
        })
      ])
    );
    expect(agent.prompt).toContain("2 route/API impacts");
  });

  it("returns a markdown redteam report for MCP agents", () => {
    const repo = createWeakTestRepo();

    const output = runRedteamReportTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Redteam Report");
    expect(output).toContain("### Test Evidence Audit");
    expect(output).toContain("Changed test has no assertions");
    expect(output).toContain("LLM/model called: no");
  });

  it("returns a JSON redteam report for MCP agents", () => {
    const repo = createWeakTestRepo();
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const output = JSON.parse(runRedteamReportTool({ cwd: repo }, { format: "json" }));

    expect(output).toMatchObject({
      tool: "CodeDecay",
      mode: "deterministic",
      safety: {
        commandsExecuted: false,
        llmCalled: false
      }
    });
    expect(output.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.testAudit.status).toBe("weak");
    expect(output.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill"
      })
    ]);
  });

  it("returns a markdown agent task bundle for MCP agents", () => {
    const repo = createWeakTestRepo();

    const output = runAgentTaskBundleTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Agent Task Bundle");
    expect(output).toContain("### Instructions For The Agent");
    expect(output).toContain("### Copy-Paste Prompt");
    expect(output).toContain("You are helping fix a pull request using a CodeDecay agent task bundle.");
    expect(output).toContain("### Tool Evidence");
    expect(output).toContain("Changed test has no assertions");
    expect(output).toContain("LLM/model called by CodeDecay: no");
  });

  it("returns JSON agent task bundles for MCP agent profiles", () => {
    const repo = createWeakTestRepo();
    writeFile(repo, ".agents/skills/pr-red-team/SKILL.md", "# PR Red-Team Skill\n\nFind missed PR risks.\n");

    const output = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json", profile: "opencode" }));
    const piOutput = JSON.parse(runAgentTaskBundleTool({ cwd: repo }, { format: "json", profile: "pi" }));

    expect(output).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      safety: {
        commandsExecuted: false,
        llmCalled: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(output.prompt).toContain("CodeDecay agent task bundle");
    expect(output.agentProfile).toMatchObject({
      id: "opencode",
      name: "OpenCode"
    });
    expect(output.prompt).toContain("Target agent profile: OpenCode");
    expect(piOutput.agentProfile).toMatchObject({
      id: "pi",
      name: "Pi"
    });
    expect(piOutput.prompt).toContain("Target agent profile: Pi");
    expect(output.prompt).toContain("did not call an LLM");
    expect(output.evidence.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.skills).toEqual([
      expect.objectContaining({
        id: "pr-red-team",
        title: "PR Red-Team Skill"
      })
    ]);
  });
});
