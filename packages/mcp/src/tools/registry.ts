import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAnalysisMcpTools } from "./register-analysis";
import { registerExecutionMcpTools } from "./register-execution";
import { registerProductMcpTools } from "./register-product";
import type {
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  ExecuteConfiguredChecksToolInput,
  McpToolInput,
  ProductRerunToolInput,
  ProductRunToolInput,
  ProductToolInput
} from "./types";

export interface CodeDecayMcpToolHandlers {
  analyzePr(input: AnalyzePrToolInput): string | Promise<string>;
  impactMap(input: McpToolInput): string | Promise<string>;
  auditTests(input: McpToolInput): string | Promise<string>;
  suggestEdgeCases(input: McpToolInput): string | Promise<string>;
  redteamReport(input: AnalyzePrToolInput): string | Promise<string>;
  agentTaskBundle(input: AgentTaskBundleToolInput): string | Promise<string>;
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
