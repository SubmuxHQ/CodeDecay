import {
  createAgentTaskBundle,
  isAgentProfileId,
  renderAgentTaskBundle,
  type AgentProfileId,
  type AgentTaskBundleFormat
} from "@submuxhq/codedecay-agent";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRedteamReport } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { RunExecuteCommandDependencies } from "./types";

export function createAgentProcessHarnessContextForCli(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  configuredContext: Record<string, unknown> | undefined,
  dependencies: RunExecuteCommandDependencies
): Record<string, unknown> {
  const profile = agentProfileFromContext(configuredContext?.agentProfile);
  const bundleFormat = agentBundleFormatFromContext(configuredContext?.agentBundleFormat);
  const analysis = dependencies.createAnalysisContext(rootDir, { format: "json" });
  const report = createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: analysis.loadedMemory.memory,
    memorySource: analysis.loadedMemory.sourcePath,
    skills: loadCodeDecaySkills({ cwd: rootDir })
  });
  const bundle = createAgentTaskBundle(report, { profile });

  return {
    ...configuredContext,
    agentProfile: profile,
    agentBundleFormat: bundleFormat,
    agentBundle: renderAgentTaskBundle(bundle, bundleFormat)
  };
}

function agentProfileFromContext(value: unknown): AgentProfileId {
  return typeof value === "string" && isAgentProfileId(value) ? value : "generic";
}

function agentBundleFormatFromContext(value: unknown): AgentTaskBundleFormat {
  return value === "json" || value === "markdown" ? value : "markdown";
}
