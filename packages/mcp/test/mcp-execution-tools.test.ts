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

describe("CodeDecay MCP execution tools", () => {
  it("does not execute configured checks without explicit confirmation", async () => {
    const repo = createExecutionRepo({ allowCommands: true });

    const output = JSON.parse(await runExecuteConfiguredChecksTool({ cwd: repo }, { format: "json" }));

    expect(output.executed).toBe(false);
    expect(output.summary.status).toBe("not_confirmed");
    expect(output.summary.total).toBe(0);
    expect(output.safety.confirmExecutionRequired).toBe(true);
    expect(output.safety.confirmExecution).toBe(false);
    expect(output.safety.allowCommands).toBe(true);
    expect(marker(repo)).not.toContain("command");
  });

  it("uses existing skip behavior when command execution is disabled", async () => {
    const repo = createExecutionRepo({ allowCommands: false });

    const output = JSON.parse(
      await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "json" })
    );

    expect(output.executed).toBe(true);
    expect(output.summary).toMatchObject({
      status: "skipped",
      total: 3,
      skipped: 3
    });
    expect(output.safety.allowCommands).toBe(false);
    expect(output.results[0]).toMatchObject({
      kind: "test",
      command: "node scripts/command-check.mjs",
      status: "skipped"
    });
    expect(output.toolAdapters.map((adapter: { kind: string; status: string }) => [adapter.kind, adapter.status])).toEqual([
      ["playwright", "skipped"],
      ["pact", "skipped"]
    ]);
    expect(marker(repo)).not.toContain("command");
  });

  it("runs configured commands and tool adapters when confirmed", async () => {
    const repo = createExecutionRepo({ allowCommands: true });

    const output = JSON.parse(
      await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "json" })
    );

    expect(output.executed).toBe(true);
    expect(output.summary).toMatchObject({
      status: "passed",
      total: 3,
      passed: 3
    });
    expect(output.results[0]).toMatchObject({
      kind: "test",
      command: "node scripts/command-check.mjs",
      status: "passed"
    });
    expect(output.toolAdapters.map((adapter: { kind: string; status: string }) => [adapter.kind, adapter.status])).toEqual([
      ["playwright", "passed"],
      ["pact", "passed"]
    ]);
    expect(marker(repo)).toContain("command");
    expect(marker(repo)).toContain("playwright");
    expect(marker(repo)).toContain("pact");
  });

  it("reports configured tool adapter failures", async () => {
    const repo = createExecutionRepo({ allowCommands: true, failPact: true });

    const output = JSON.parse(
      await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "json" })
    );

    expect(output.summary.status).toBe("failed");
    expect(output.summary.failed).toBe(1);
    expect(output.toolAdapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pact",
          status: "failed",
          failure: expect.objectContaining({
            mode: "nonzero-exit"
          })
        })
      ])
    );
  });

  it("returns a markdown configured checks execution report", async () => {
    const repo = createExecutionRepo({ allowCommands: true });

    const output = await runExecuteConfiguredChecksTool({ cwd: repo }, { confirmExecution: true, format: "markdown" });

    expect(output).toContain("## CodeDecay MCP Execution Report");
    expect(output).toContain("### Configured Command Results");
    expect(output).toContain("### Tool Adapter Results");
    expect(output).toContain("This MCP tool never runs arbitrary commands from MCP input.");
  });
});
