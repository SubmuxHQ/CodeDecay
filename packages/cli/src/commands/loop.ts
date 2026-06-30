import { resolve } from "node:path";
import { createAgentTaskBundle, renderAgentTaskBundle } from "@submuxhq/codedecay-agent";
import { loadCodeDecayConfig, type CodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { getGitChangedFiles } from "@submuxhq/codedecay-git";
import { renderLoopReport, runCodeDecayLoop, type LoopCheckSnapshot, type LoopReport } from "@submuxhq/codedecay-harness";
import type { RedteamReport } from "@submuxhq/codedecay-redteam";
import { CliExit } from "../errors";
import { parseLoopArgs } from "../parsers/args";
import type { AgentOptions, AnalyzeOptions, CliAnalysisContext, CliCommandContext, CliRuntime, RedteamOptions } from "../types";
import { createExecutionReport } from "./execute/report";
import type { RunExecuteCommandDependencies } from "./execute/types";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";

export interface RunLoopCommandDependencies {
  createAnalysisContext(rootDir: string, options: AgentOptions | AnalyzeOptions | RedteamOptions): CliAnalysisContext;
  resolveRepoRoot: RedteamReportDependencies["resolveRepoRoot"];
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runLoopCommand(
  context: CliCommandContext,
  dependencies: RunLoopCommandDependencies
): Promise<void> {
  const options = parseLoopArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, {
    base: options.base,
    head: options.head,
    format: options.format
  });
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const report = await runCodeDecayLoop({
    cwd: rootDir,
    base: options.base,
    head: options.head,
    maxRounds: options.maxRounds,
    agentCommand: options.agentCommand,
    safeRiskLevel: options.safeRiskLevel,
    agentTimeoutMs: loadedConfig.config.safety.commandTimeoutMs,
    commandSafety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    },
    createRedteamReport: async () =>
      await createRedteamReportForCli(rootDir, {
        base: options.base,
        head: options.head,
        format: "json"
      }, dependencies),
    renderAgentBundle: (redteamReport) =>
      renderAgentTaskBundle(createAgentTaskBundle(redteamReport as RedteamReport, { profile: "generic" }), "markdown"),
    runConfiguredChecks: async () => await createLoopCheckSnapshot(rootDir, loadedConfig, dependencies),
    getChangedFiles: () => getGitChangedFiles({ cwd: rootDir })
  });

  dependencies.writeOutput({
    cwd: rootDir,
    output: options.output,
    rendered: renderLoopReport(report, options.format),
    runtime: context.runtime
  });

  if (shouldFail(report)) {
    throw new CliExit(1);
  }
}

async function createLoopCheckSnapshot(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  dependencies: RunExecuteCommandDependencies
): Promise<LoopCheckSnapshot> {
  if (!hasConfiguredChecks(loadedConfig.config)) {
    return {
      configured: false,
      status: "not-configured",
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      errors: 0,
      durationMs: 0,
      note: "No configured commands, probes, or tool adapters were found."
    };
  }

  const report = await createExecutionReport(rootDir, loadedConfig, dependencies);
  return {
    configured: true,
    status: report.summary.status,
    total: report.summary.total,
    passed: report.summary.passed,
    failed: report.summary.failed,
    skipped: report.summary.skipped,
    timedOut: report.summary.timedOut,
    errors: report.summary.errors,
    durationMs: report.summary.durationMs
  };
}

function hasConfiguredChecks(config: CodeDecayConfig): boolean {
  return (
    config.commands.test.length > 0 ||
    config.commands.build.length > 0 ||
    config.commands.start.length > 0 ||
    config.probes.length > 0 ||
    Object.values(config.toolAdapters).some((adapter) => adapter?.enabled)
  );
}

function shouldFail(report: LoopReport): boolean {
  return report.status === "unverified" ||
    report.status === "stuck" ||
    report.status === "needs-human" ||
    report.status === "agent-error";
}
