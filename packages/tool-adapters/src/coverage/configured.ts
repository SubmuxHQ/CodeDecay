import type { CodeDecayCoverageToolAdapter, ConfiguredToolHarness, CoverageHarnessOptions } from "../types";
import { createCoverageHarness } from "./harness";
import { resolveCoverageDisplayCommand } from "./plan";

export function createConfiguredCoverageHarness(
  adapter: CodeDecayCoverageToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: CoverageHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.reportPaths !== undefined) {
    options.reportPaths = adapter.reportPaths;
  }

  if (adapter.failOn !== undefined) {
    options.failOn = adapter.failOn;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "coverage",
    name: "Coverage",
    command: resolveCoverageDisplayCommand(options),
    harness: createCoverageHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
