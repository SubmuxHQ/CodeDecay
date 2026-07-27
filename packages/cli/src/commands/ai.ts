import { resolve } from "node:path";
import { listRepoFiles } from "@submuxhq/codedecay-analyzer-js";
import {
  createAgentPreflightReport,
  createAgentTaskBundle,
  renderAgentPreflightReport,
  renderAgentTaskBundle
} from "@submuxhq/codedecay-agent";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { shouldFailForRisk } from "@submuxhq/codedecay-core";
import { loadCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { CliExit } from "../errors";
import { parseAiArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";

export interface RunAiCommandDependencies extends RedteamReportDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runAiCommand(
  context: CliCommandContext,
  dependencies: RunAiCommandDependencies
): Promise<void> {
  const options = parseAiArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");

  if (options.mode === "preflight") {
    const rootDir = dependencies.resolveRepoRoot(cwd, options);
    const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
    const loadedMemory = loadCodeDecayMemory(rootDir);
    const report = createAgentPreflightReport({
      task: options.task ?? "",
      rootDir,
      repoFiles: listRepoFiles(rootDir),
      config: loadedConfig.config,
      configSource: loadedConfig.sourcePath,
      memory: loadedMemory.memory,
      memorySource: loadedMemory.sourcePath
    });

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

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }

  if (options.withChecks && isBlockingVerificationStatus(report.summary.verificationStatus)) {
    throw new CliExit(1);
  }
}

function isBlockingVerificationStatus(status: string): boolean {
  return status === "failed" || status === "blocked";
}
