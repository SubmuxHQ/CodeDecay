import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import type { McpProductSafety } from "./types";

export function createProductSafety(
  loadedConfig: LoadedCodeDecayConfig,
  confirmExecution: boolean,
  notes: string[]
): McpProductSafety {
  return {
    confirmExecutionRequired: true,
    confirmExecution,
    allowCommands: loadedConfig.config.safety.allowCommands,
    notes: [
      ...notes,
      "Product target startup, browser automation, and generated test execution still obey safety.allowCommands in CodeDecay config.",
      "No telemetry, cloud execution, LLM calls, or arbitrary MCP-provided commands are used."
    ]
  };
}
