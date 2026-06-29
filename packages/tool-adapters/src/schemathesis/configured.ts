import { resolveSchemathesisCommand } from "./commands";
import { createSchemathesisHarness } from "./harness";
import type {
  CodeDecaySchemathesisToolAdapter,
  ConfiguredToolHarness,
  SchemathesisHarnessOptions
} from "../types";

export function createConfiguredSchemathesisHarness(
  adapter: CodeDecaySchemathesisToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SchemathesisHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.schema !== undefined) {
    options.schema = adapter.schema;
  }

  if (adapter.baseUrl !== undefined) {
    options.baseUrl = adapter.baseUrl;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const command = resolveSchemathesisCommand(options);
  const configured: ConfiguredToolHarness = {
    kind: "schemathesis",
    name: "Schemathesis",
    command,
    harness: createSchemathesisHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
