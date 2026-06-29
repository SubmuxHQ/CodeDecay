import type { CodeDecayStrykerToolAdapter, ConfiguredToolHarness, StrykerHarnessOptions } from "../types";
import { DEFAULT_STRYKER_COMMAND } from "./constants";
import { createStrykerHarness } from "./harness";

export function createConfiguredStrykerHarness(
  adapter: CodeDecayStrykerToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_STRYKER_COMMAND;
  const options: StrykerHarnessOptions = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  const configured: ConfiguredToolHarness = {
    kind: "stryker",
    name: "StrykerJS",
    command,
    harness: createStrykerHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
