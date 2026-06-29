import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { renderMcpExecutionMarkdown } from "./markdown";
import type {
  McpExecutionReport,
  McpExecutionResult,
  McpExecutionSafety,
  McpExecutionSummary,
  McpExecutionToolAdapterResult
} from "./types";

export { createExecutionSummary, elapsed } from "./summary";

export function createBaseExecutionReport(input: {
  loadedConfig: LoadedCodeDecayConfig;
  executed: boolean;
  safety: McpExecutionSafety;
  summary: McpExecutionSummary;
  results: McpExecutionResult[];
  toolAdapters: McpExecutionToolAdapterResult[];
}): McpExecutionReport {
  const report: McpExecutionReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "mcp-execute",
    generatedAt: new Date().toISOString(),
    executed: input.executed,
    summary: input.summary,
    results: input.results,
    toolAdapters: input.toolAdapters,
    safety: input.safety
  };

  if (input.loadedConfig.sourcePath) {
    report.configSource = input.loadedConfig.sourcePath;
  }

  return report;
}

export function renderMcpExecutionReport(report: McpExecutionReport, format: "markdown" | "json"): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderMcpExecutionMarkdown(report);
}
