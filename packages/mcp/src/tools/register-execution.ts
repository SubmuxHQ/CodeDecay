import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeDecayMcpToolHandlers } from "./registry";
import { textResult } from "./result";
import { executeConfiguredChecksToolSchema } from "./schemas";
import type { ExecuteConfiguredChecksToolInput } from "./types";

export function registerExecutionMcpTools(server: McpServer, handlers: CodeDecayMcpToolHandlers): void {
  server.tool(
    "execute_configured_checks",
    "Run only explicitly configured CodeDecay commands and tool adapters. Requires confirmExecution=true and safety.allowCommands=true; never runs arbitrary MCP-provided commands.",
    executeConfiguredChecksToolSchema,
    async (input) => textResult(handlers.executeConfiguredChecks(input as ExecuteConfiguredChecksToolInput))
  );
}
