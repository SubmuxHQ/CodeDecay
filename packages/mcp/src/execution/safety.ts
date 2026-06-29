import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import type { McpExecutionSafety } from "./types";

export function createExecutionSafety(
  loadedConfig: LoadedCodeDecayConfig,
  confirmExecution: boolean
): McpExecutionSafety {
  const notes = [
    "This MCP tool never runs arbitrary commands from MCP input.",
    "Only commands explicitly configured in CodeDecay config and enabled tool adapters are eligible to run.",
    "Command execution also requires safety.allowCommands: true in CodeDecay config."
  ];

  if (!confirmExecution) {
    notes.push("No commands were executed because confirmExecution was not true.");
  }

  if (!loadedConfig.config.safety.allowCommands) {
    notes.push("Configured commands will be skipped because safety.allowCommands is false.");
  }

  return {
    confirmExecutionRequired: true,
    confirmExecution,
    allowCommands: loadedConfig.config.safety.allowCommands,
    notes
  };
}
