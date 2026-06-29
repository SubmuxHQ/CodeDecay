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

describe("CodeDecay MCP product tools", () => {
  it("plans product verification targets without executing commands", () => {
    const repo = createProductRepo();

    const output = JSON.parse(runProductPlanTool({ cwd: repo }, { format: "json" }));

    expect(output.mode).toBe("mcp-product-plan");
    expect(output.latestReportPath).toBe(".codedecay/local/product-runs/latest.json");
    expect(output.targets[0]).toMatchObject({
      id: "api",
      apiEndpoints: 1
    });
    expect(output.safety.confirmExecution).toBe(false);
    expect(productMarker(repo)).toBe("");
  });

  it("runs product verification through a fixed local CLI and returns failures", () => {
    const repo = createProductRepo();
    const cliPath = writeFakeProductCli(repo);

    const output = JSON.parse(
      runProductRunTool(
        { cwd: repo, cliPath },
        {
          target: "api",
          generateApiTests: true,
          runGeneratedApiTests: true,
          confirmExecution: true,
          format: "json"
        }
      )
    );
    const failures = JSON.parse(runProductFailuresTool({ cwd: repo }, { format: "json" }));

    expect(output.executed).toBe(true);
    expect(output.exitCode).toBe(1);
    expect(output.command).toEqual(
      expect.arrayContaining(["product", "--target", "api", "--generate-api-tests", "--run-generated-api-tests"])
    );
    expect(output.failures[0]).toMatchObject({
      checkId: "api-get-users",
      checkKind: "api",
      rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
    });
    expect(failures.failures).toHaveLength(1);
    expect(productMarker(repo)).toContain("--generate-api-tests");
  });

  it("reruns the first latest product failure by generated test id", () => {
    const repo = createProductRepo();
    const cliPath = writeFakeProductCli(repo);
    runProductRunTool({ cwd: repo, cliPath }, { target: "api", runGeneratedApiTests: true, confirmExecution: true, format: "json" });

    const output = JSON.parse(runProductRerunTool({ cwd: repo, cliPath }, { confirmExecution: true, format: "json" }));

    expect(output.executed).toBe(true);
    expect(output.command).toEqual(
      expect.arrayContaining(["--target", "api", "--run-generated-api-tests", "--test-id", "api-get-users"])
    );
    expect(productMarker(repo)).toContain("--test-id api-get-users");
  });
});
