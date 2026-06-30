import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAnalysisMcpTools } from "./register-analysis";
import { registerExecutionMcpTools } from "./register-execution";
import { registerProductMcpTools } from "./register-product";
import type {
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  DesignContractCheckToolInput,
  ExecuteConfiguredChecksToolInput,
  FixTasksToolInput,
  McpToolInput,
  ProductRerunToolInput,
  ProductRunToolInput,
  ProductToolInput,
  RegressionSurfaceToolInput,
  ScopeCheckToolInput,
  WhatDidIMissToolInput
} from "./types";

export interface CodeDecayMcpToolHandlers {
  analyzePr(input: AnalyzePrToolInput): string | Promise<string>;
  impactMap(input: McpToolInput): string | Promise<string>;
  auditTests(input: McpToolInput): string | Promise<string>;
  suggestEdgeCases(input: McpToolInput): string | Promise<string>;
  toolRecommendations(input: AnalyzePrToolInput): string | Promise<string>;
  patternSearch(input: McpToolInput): string | Promise<string>;
  redteamReport(input: AnalyzePrToolInput): string | Promise<string>;
  agentTaskBundle(input: AgentTaskBundleToolInput): string | Promise<string>;
  scopeCheck(input: ScopeCheckToolInput): string | Promise<string>;
  designContractCheck(input: DesignContractCheckToolInput): string | Promise<string>;
  fixTasks(input: FixTasksToolInput): string | Promise<string>;
  whatDidIMiss(input: WhatDidIMissToolInput): string | Promise<string>;
  regressionSurface(input: RegressionSurfaceToolInput): string | Promise<string>;
  executeConfiguredChecks(input: ExecuteConfiguredChecksToolInput): string | Promise<string>;
  productPlan(input: ProductToolInput): string | Promise<string>;
  productRun(input: ProductRunToolInput): string | Promise<string>;
  productFailures(input: ProductToolInput): string | Promise<string>;
  productRerun(input: ProductRerunToolInput): string | Promise<string>;
}

export function registerCodeDecayMcpTools(server: McpServer, handlers: CodeDecayMcpToolHandlers): void {
  registerAnalysisMcpTools(server, handlers);
  registerExecutionMcpTools(server, handlers);
  registerProductMcpTools(server, handlers);
}
