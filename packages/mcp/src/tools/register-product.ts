import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeDecayMcpToolHandlers } from "./registry";
import { textResult } from "./result";
import {
  productRerunToolSchema,
  productRunToolSchema,
  productToolSchema
} from "./schemas";
import type {
  ProductRerunToolInput,
  ProductRunToolInput,
  ProductToolInput
} from "./types";

export function registerProductMcpTools(server: McpServer, handlers: CodeDecayMcpToolHandlers): void {
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
