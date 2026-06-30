import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRedteamReport } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { AgentOptions, CliAnalysisContext, RedteamOptions } from "../types";
import { loadConfiguredRedteamMemory } from "../memory/configured-providers";
import { createRedteamInvestigation } from "./redteam-investigation";

export interface RedteamReportDependencies {
  createAnalysisContext(rootDir: string, options: AgentOptions | RedteamOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
}

export async function createRedteamReportForCli(
  cwd: string,
  options: AgentOptions | RedteamOptions,
  dependencies: RedteamReportDependencies
) {
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analysis = dependencies.createAnalysisContext(rootDir, options);
  const memoryContext = await loadConfiguredRedteamMemory({
    rootDir,
    localMemory: analysis.loadedMemory,
    memoryProviders: loadedConfig.config.memoryProviders
  });
  const loadedSkills = loadCodeDecaySkills({ cwd: rootDir });
  const investigation = "investigate" in options && options.investigate
    ? await createRedteamInvestigation({
        llmConfig: loadedConfig.config.llm,
        analysisReport: analysis.report,
        memory: memoryContext.memory,
        memorySource: memoryContext.sourcePath,
        skills: loadedSkills
      })
    : undefined;

  return createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: memoryContext.memory,
    memorySource: memoryContext.sourcePath,
    memoryProviderSources: memoryContext.providerSources,
    skills: loadedSkills,
    investigation
  });
}
