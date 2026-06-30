import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createAnalysisReport, type CodeDecayReport } from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import { applyMemoryContext, loadCodeDecayMemory, type LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, type RedteamReport } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { loadLatestProductRun } from "../../product/latest-run";
import type { StartMcpServerOptions } from "../../server/types";
import type { McpToolInput } from "../../tools/types";

export interface McpAnalysisContext {
  rootDir: string;
  loadedConfig: LoadedCodeDecayConfig;
  loadedMemory: LoadedCodeDecayMemory;
  report: CodeDecayReport;
}

export function createAnalysisContext(serverOptions: StartMcpServerOptions, input: McpToolInput): McpAnalysisContext {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const changedFiles = getGitChangedFiles({
    cwd: rootDir,
    base: input.base,
    head: input.head
  });

  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles,
    designContract: loadedConfig.config.designContract
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const analyzerResultWithMemory = applyMemoryContext({
    memory: loadedMemory.memory,
    changedFiles,
    impactedAreas: analyzerResult.impactedAreas,
    analyzerResult
  });

  return {
    rootDir,
    loadedConfig,
    loadedMemory,
    report: createAnalysisReport({
      base: input.base,
      head: input.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory,
      productFailureBundles: loadLatestProductRun(rootDir).failures
    })
  };
}

export function createMcpRedteamReport(context: McpAnalysisContext): RedteamReport {
  return createRedteamReport({
    analysisReport: context.report,
    config: context.loadedConfig.config,
    configSource: context.loadedConfig.sourcePath,
    memory: context.loadedMemory.memory,
    memorySource: context.loadedMemory.sourcePath,
    skills: loadCodeDecaySkills({ cwd: context.rootDir })
  });
}
