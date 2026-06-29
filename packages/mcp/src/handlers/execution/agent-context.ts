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
import { createAnalysisContext } from "../analysis/context";

export function createAgentProcessHarnessContextForMcp(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  configuredContext: Record<string, unknown> | undefined
): Record<string, unknown> {
  const profile = agentProfileFromContext(configuredContext?.agentProfile);
  const bundleFormat = agentBundleFormatFromContext(configuredContext?.agentBundleFormat);
  const context = createAnalysisContext({ cwd: rootDir }, { cwd: rootDir });
  const report = createRedteamReport({
    analysisReport: context.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: context.loadedMemory.memory,
    memorySource: context.loadedMemory.sourcePath,
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
