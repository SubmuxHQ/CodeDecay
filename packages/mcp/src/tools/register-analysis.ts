import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeDecayMcpToolHandlers } from "./registry";
import { textResult } from "./result";
import {
  agentTaskBundleToolSchema,
  analyzePrToolSchema,
  gitContextToolSchema
} from "./schemas";
import type {
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  McpToolInput
} from "./types";

export function registerAnalysisMcpTools(server: McpServer, handlers: CodeDecayMcpToolHandlers): void {
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
}
