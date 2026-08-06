import { DEFAULT_PLAYWRIGHT_COMMAND } from "./constants";
import { createPlaywrightHarness } from "./harness";
import type { CodeDecayCommandToolAdapter, ConfiguredToolHarness, PlaywrightHarnessOptions } from "../types";

export function createConfiguredPlaywrightHarness(
  adapter: CodeDecayCommandToolAdapter,
  safety: { allowCommands: boolean; capabilityPolicy?: import("@submuxhq/codedecay-execution").CapabilityPolicy | undefined }
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_PLAYWRIGHT_COMMAND;
  const harnessOptions: PlaywrightHarnessOptions & { command: string } = {
    command,
    allowCommands: safety.allowCommands,
    capabilityPolicy: safety.capabilityPolicy
  };

  if (adapter.timeoutMs !== undefined) {
    harnessOptions.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "playwright",
    name: "Playwright",
    command,
    harness: createPlaywrightHarness(harnessOptions)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
