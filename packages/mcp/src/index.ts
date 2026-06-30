import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import {
  runAgentTaskBundleTool,
  runAnalyzePrTool,
  runAuditTestsTool,
  runDesignContractCheckTool,
  runFixTasksTool,
  runImpactMapTool,
  runPatternSearchTool,
  runRegressionSurfaceTool,
  runRedteamReportTool,
  runScopeCheckTool,
  runSuggestEdgeCasesTool,
  runToolRecommendationsTool,
  runWhatDidIMissTool
} from "./handlers/analysis";
import { runExecuteConfiguredChecksTool } from "./handlers/execution";
import {
  runProductFailuresTool,
  runProductPlanTool,
  runProductRerunTool,
  runProductRunTool
} from "./handlers/product";
import type { StartMcpServerOptions } from "./server/types";
import { registerCodeDecayMcpTools } from "./tools/registry";

export type { StartMcpServerOptions } from "./server/types";
export {
  runAgentTaskBundleTool,
  runAnalyzePrTool,
  runAuditTestsTool,
  runDesignContractCheckTool,
  runFixTasksTool,
  runImpactMapTool,
  runPatternSearchTool,
  runRegressionSurfaceTool,
  runRedteamReportTool,
  runScopeCheckTool,
  runSuggestEdgeCasesTool,
  runToolRecommendationsTool,
  runWhatDidIMissTool
} from "./handlers/analysis";
export { runExecuteConfiguredChecksTool } from "./handlers/execution";
export {
  runProductFailuresTool,
  runProductPlanTool,
  runProductRerunTool,
  runProductRunTool
} from "./handlers/product";

export async function startMcpServer(options: StartMcpServerOptions): Promise<void> {
  const server = createCodeDecayMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createCodeDecayMcpServer(options: StartMcpServerOptions): McpServer {
  const server = new McpServer({
    name: "codedecay",
    version: CODEDECAY_VERSION
  });

  registerCodeDecayMcpTools(server, {
    analyzePr: (input) => runAnalyzePrTool(options, input),
    impactMap: (input) => runImpactMapTool(options, input),
    auditTests: (input) => runAuditTestsTool(options, input),
    suggestEdgeCases: (input) => runSuggestEdgeCasesTool(options, input),
    toolRecommendations: (input) => runToolRecommendationsTool(options, input),
    patternSearch: (input) => runPatternSearchTool(options, input),
    redteamReport: (input) => runRedteamReportTool(options, input),
    agentTaskBundle: (input) => runAgentTaskBundleTool(options, input),
    scopeCheck: (input) => runScopeCheckTool(options, input),
    designContractCheck: (input) => runDesignContractCheckTool(options, input),
    fixTasks: (input) => runFixTasksTool(options, input),
    whatDidIMiss: (input) => runWhatDidIMissTool(options, input),
    regressionSurface: (input) => runRegressionSurfaceTool(options, input),
    executeConfiguredChecks: (input) => runExecuteConfiguredChecksTool(options, input),
    productPlan: (input) => runProductPlanTool(options, input),
    productRun: (input) => runProductRunTool(options, input),
    productFailures: (input) => runProductFailuresTool(options, input),
    productRerun: (input) => runProductRerunTool(options, input)
  });

  return server;
}
