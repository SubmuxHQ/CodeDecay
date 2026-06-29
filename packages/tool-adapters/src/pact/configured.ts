import { DEFAULT_PACT_COMMAND } from "./constants";
import { createPactHarness } from "./harness";
import type { CodeDecayCommandToolAdapter, ConfiguredToolHarness, PactHarnessOptions } from "../types";

export function createConfiguredPactHarness(
  adapter: CodeDecayCommandToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_PACT_COMMAND;
  const harnessOptions: PactHarnessOptions & { command: string } = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    harnessOptions.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "pact",
    name: "Pact",
    command,
    harness: createPactHarness(harnessOptions)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
