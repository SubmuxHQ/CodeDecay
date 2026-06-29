import type { CodeDecaySemgrepToolAdapter, ConfiguredToolHarness, SemgrepHarnessOptions } from "../types";
import { createSemgrepHarness } from "./harness";
import { resolveSemgrepDisplayCommand } from "./commands";

export function createConfiguredSemgrepHarness(
  adapter: CodeDecaySemgrepToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SemgrepHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.config !== undefined) {
    options.config = adapter.config;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  if (adapter.failOnSeverity !== undefined) {
    options.failOnSeverity = adapter.failOnSeverity;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "semgrep",
    name: "Semgrep",
    command: resolveSemgrepDisplayCommand(options),
    harness: createSemgrepHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
