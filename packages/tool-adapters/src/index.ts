import { createAgentProcessHarness, createConfiguredAgentProcessHarness } from "./agent-process";
import { createCoverageHarness, createConfiguredCoverageHarness } from "./coverage";
export * from "./doctor";
export * from "./migration";
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
  const safety = {
    allowCommands: config.safety.allowCommands,
    capabilityPolicy: config.safety.capabilityPolicy
  };

  if (config.toolAdapters.agentProcess?.enabled) {
    configured.push(createConfiguredAgentProcessHarness(config.toolAdapters.agentProcess, safety));
  }

  if (config.toolAdapters.playwright?.enabled) {
    configured.push(createConfiguredPlaywrightHarness(config.toolAdapters.playwright, safety));
  }

  if (config.toolAdapters.stryker?.enabled) {
    configured.push(createConfiguredStrykerHarness(config.toolAdapters.stryker, safety));
  }

  if (config.toolAdapters.schemathesis?.enabled) {
    configured.push(createConfiguredSchemathesisHarness(config.toolAdapters.schemathesis, safety));
  }

  if (config.toolAdapters.pact?.enabled) {
    configured.push(createConfiguredPactHarness(config.toolAdapters.pact, safety));
  }

  if (config.toolAdapters.semgrep?.enabled) {
    configured.push(createConfiguredSemgrepHarness(config.toolAdapters.semgrep, safety));
  }

  if (config.toolAdapters.coverage?.enabled) {
    configured.push(createConfiguredCoverageHarness(config.toolAdapters.coverage, safety));
  }

  return configured;
}
