import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  agentTaskBundleToolSchema,
  analyzePrToolSchema,
  executeConfiguredChecksToolSchema,
  gitContextToolSchema,
  productRerunToolSchema,
  productRunToolSchema,
  productToolSchema
} from "./schemas";
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
  server.tool(
    "analyze_pr",
    "Analyze a pull request or working tree for regression risk and maintainability decay.",
    analyzePrToolSchema,
    async (input) => textResult(handlers.analyzePr(input as AnalyzePrToolInput))
  );

  server.tool(
    "impact_map",
    "Return changed files, likely impacted product/system areas, and concrete route/API impacts for the PR.",
    gitContextToolSchema,
    async (input) => textResult(handlers.impactMap(input as McpToolInput))
  );

  server.tool(
    "audit_tests",
    "Return missing-test and weak-test proof findings such as no changed tests, no assertions, snapshot-only tests, mocked changed source, unrelated tests, and copied implementation logic.",
    gitContextToolSchema,
    async (input) => textResult(handlers.auditTests(input as McpToolInput))
  );

  server.tool(
    "suggest_edge_cases",
    "Return deterministic edge-case and real-check suggestions for impacted areas. This does not call an LLM.",
    gitContextToolSchema,
    async (input) => textResult(handlers.suggestEdgeCases(input as McpToolInput))
  );

  server.tool(
    "redteam_report",
    "Return a deterministic CodeDecay redteam report for an MCP-compatible agent. Report-only: does not execute commands or call models.",
    analyzePrToolSchema,
    async (input) => textResult(handlers.redteamReport(input as AnalyzePrToolInput))
  );

  server.tool(
    "agent_task_bundle",
    "Return a deterministic CodeDecay task bundle that user-owned coding agents can use to fix PR risks. Report-only: does not execute commands or call models.",
    agentTaskBundleToolSchema,
    async (input) => textResult(handlers.agentTaskBundle(input as AgentTaskBundleToolInput))
  );

  server.tool(
    "execute_configured_checks",
    "Run only explicitly configured CodeDecay commands and tool adapters. Requires confirmExecution=true and safety.allowCommands=true; never runs arbitrary MCP-provided commands.",
    executeConfiguredChecksToolSchema,
    async (input) => textResult(handlers.executeConfiguredChecks(input as ExecuteConfiguredChecksToolInput))
  );

  server.tool(
    "codedecay_product_plan",
    "Plan configured product verification targets and artifact paths without running product commands.",
    productToolSchema,
    async (input) => textResult(handlers.productPlan(input as ProductToolInput))
  );

  server.tool(
    "codedecay_product_run",
    "Run fixed CodeDecay product verification commands. Requires confirmExecution=true; never runs arbitrary MCP-provided commands.",
    productRunToolSchema,
    async (input) => textResult(handlers.productRun(input as ProductRunToolInput))
  );

  server.tool(
    "codedecay_product_failures",
    "Return product verification failures from the latest local product run artifact.",
    productToolSchema,
    async (input) => textResult(handlers.productFailures(input as ProductToolInput))
  );

  server.tool(
    "codedecay_product_rerun",
    "Rerun one failed generated product check from the latest local product run artifact. Requires confirmExecution=true.",
    productRerunToolSchema,
    async (input) => textResult(handlers.productRerun(input as ProductRerunToolInput))
  );
}

async function textResult(value: string | Promise<string>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return {
    content: [
      {
        type: "text",
        text: await value
      }
    ]
  };
}
