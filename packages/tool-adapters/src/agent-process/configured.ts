import type {
  AgentProcessHarnessOptions,
  CodeDecayAgentProcessToolAdapter,
  ConfiguredToolHarness
} from "../types";
import {
  DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT,
  DEFAULT_AGENT_PROCESS_PROFILE
} from "./constants";
import { createAgentProcessHarness } from "./harness";

export function createConfiguredAgentProcessHarness(
  adapter: CodeDecayAgentProcessToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: AgentProcessHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.profile !== undefined) {
    options.profile = adapter.profile;
  }

  if (adapter.bundleFormat !== undefined) {
    options.bundleFormat = adapter.bundleFormat;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;
  const configured: ConfiguredToolHarness = {
    kind: "agent-process",
    name: "Agent Process",
    command: options.command ?? "<agent command required>",
    context: {
      agentProfile: profile,
      agentBundleFormat: bundleFormat
    },
    harness: createAgentProcessHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}
