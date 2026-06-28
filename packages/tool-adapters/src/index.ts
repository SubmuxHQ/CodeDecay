import { createAgentProcessHarness, createConfiguredAgentProcessHarness } from "./agent-process";
import { createCoverageHarness, createConfiguredCoverageHarness } from "./coverage";
import { createPactHarness, createConfiguredPactHarness } from "./pact";
import { createPlaywrightHarness, createConfiguredPlaywrightHarness } from "./playwright";
import { createSchemathesisHarness, createConfiguredSchemathesisHarness } from "./schemathesis";
import { createSemgrepHarness, createConfiguredSemgrepHarness } from "./semgrep";
import { createStrykerHarness, createConfiguredStrykerHarness } from "./stryker";
import type { CodeDecayConfig, ConfiguredToolHarness } from "./types";

export {
  createAgentProcessHarness,
  createCoverageHarness,
  createPactHarness,
  createPlaywrightHarness,
  createSchemathesisHarness,
  createSemgrepHarness,
  createStrykerHarness
};

export type {
  AgentProcessHarnessOptions,
  ConfiguredToolAdapterKind,
  ConfiguredToolHarness,
  CoverageHarnessOptions,
  PactHarnessOptions,
  PlaywrightHarnessOptions,
  SchemathesisHarnessOptions,
  SemgrepHarnessOptions,
  StrykerHarnessOptions
} from "./types";

export function createConfiguredToolHarnesses(config: CodeDecayConfig): ConfiguredToolHarness[] {
  const configured: ConfiguredToolHarness[] = [];

  if (config.toolAdapters.agentProcess?.enabled) {
    configured.push(createConfiguredAgentProcessHarness(config.toolAdapters.agentProcess, config.safety.allowCommands));
  }

  if (config.toolAdapters.playwright?.enabled) {
    configured.push(createConfiguredPlaywrightHarness(config.toolAdapters.playwright, config.safety.allowCommands));
  }

  if (config.toolAdapters.stryker?.enabled) {
    configured.push(createConfiguredStrykerHarness(config.toolAdapters.stryker, config.safety.allowCommands));
  }

  if (config.toolAdapters.schemathesis?.enabled) {
    configured.push(createConfiguredSchemathesisHarness(config.toolAdapters.schemathesis, config.safety.allowCommands));
  }

  if (config.toolAdapters.pact?.enabled) {
    configured.push(createConfiguredPactHarness(config.toolAdapters.pact, config.safety.allowCommands));
  }

  if (config.toolAdapters.semgrep?.enabled) {
    configured.push(createConfiguredSemgrepHarness(config.toolAdapters.semgrep, config.safety.allowCommands));
  }

  if (config.toolAdapters.coverage?.enabled) {
    configured.push(createConfiguredCoverageHarness(config.toolAdapters.coverage, config.safety.allowCommands));
  }

  return configured;
}
