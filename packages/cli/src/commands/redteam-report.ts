import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRedteamReport } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { AgentOptions, CliAnalysisContext, RedteamOptions } from "../types";

export interface RedteamReportDependencies {
  createAnalysisContext(rootDir: string, options: AgentOptions | RedteamOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
}

export function createRedteamReportForCli(
  cwd: string,
  options: AgentOptions | RedteamOptions,
  dependencies: RedteamReportDependencies
) {
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analysis = dependencies.createAnalysisContext(rootDir, options);
  const loadedSkills = loadCodeDecaySkills({ cwd: rootDir });

  return createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: analysis.loadedMemory.memory,
    memorySource: analysis.loadedMemory.sourcePath,
    skills: loadedSkills
  });
}
