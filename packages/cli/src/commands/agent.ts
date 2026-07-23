import { resolve } from "node:path";
import { listRepoFiles } from "@submuxhq/codedecay-analyzer-js";
import {
  createAgentPreflightReport,
  createAgentTaskBundle,
  renderAgentPreflightReport,
  renderAgentTaskBundle
} from "@submuxhq/codedecay-agent";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { loadCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { parseAgentArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { loadRequirementArtifact } from "../requirements/load";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";
import { createRedteamInvestigation } from "./redteam-investigation";

export interface RunAgentCommandDependencies extends RedteamReportDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runAgentCommand(
  context: CliCommandContext,
  dependencies: RunAgentCommandDependencies
): Promise<void> {
  const options = parseAgentArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");

  if (options.mode === "preflight") {
    const rootDir = dependencies.resolveRepoRoot(cwd, options);
    const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
    const loadedMemory = loadCodeDecayMemory(rootDir);
    const loadedRequirements = options.requirements
      ? loadRequirementArtifact(rootDir, options.requirements)
      : undefined;
    const report = createAgentPreflightReport({
      task: options.task ?? "",
      requirements: loadedRequirements?.context,
      requirementSource: loadedRequirements?.source,
      rootDir,
      repoFiles: listRepoFiles(rootDir),
      config: loadedConfig.config,
      configSource: loadedConfig.sourcePath,
      memory: loadedMemory.memory,
      memorySource: loadedMemory.sourcePath
    });
    if (options.investigate) {
      report.investigation = await createRedteamInvestigation({
        phase: "pre-change",
        llmConfig: loadedConfig.config.llm,
        requirements: report.requirements,
        deterministicEvidence: report.deterministicEvidence,
        limitations: report.limits,
        memory: loadedMemory.memory,
        memorySource: loadedMemory.sourcePath,
        skills: loadCodeDecaySkills({ cwd: rootDir })
      });
      report.safety.llmCalled = report.investigation.llmCalled;
    }

    dependencies.writeOutput({
      cwd,
      output: options.output,
      rendered: renderAgentPreflightReport(report, options.format),
      runtime: context.runtime
    });
    return;
  }

  const report = await createRedteamReportForCli(cwd, options, dependencies);
  const bundle = createAgentTaskBundle(report, {
    profile: options.profile,
    taskFilters: {
      source: options.filterSource,
      priority: options.filterPriority,
      file: options.filterFile
    }
  });

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderAgentTaskBundle(bundle, options.format),
    runtime: context.runtime
  });
}
