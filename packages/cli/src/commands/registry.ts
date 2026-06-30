import { runAgentCommand as runAgentCommandWithDependencies } from "./agent";
import { runAnalyzeCommand as runAnalyzeCommandWithDependencies } from "./analyze";
import { runBenchmarkCommand as runBenchmarkCommandWithDependencies } from "./benchmark";
import { runConfigCommand } from "./config";
import { runDashboardCommand as runDashboardCommandWithDependencies } from "./dashboard";
import { runDifferentialCommand as runDifferentialCommandWithDependencies } from "./differential";
import { runDoctorCommand as runDoctorCommandWithDependencies } from "./doctor";
import { runExecuteCommand as runExecuteCommandWithDependencies } from "./execute";
import { runLlmReviewCommand as runLlmReviewCommandWithDependencies } from "./llm-review";
import {
  runMemoryCommand as runMemoryCommandWithDependencies,
  runMemoryImportCommand as runMemoryImportCommandWithDependencies,
  runMemoryLearnCommand as runMemoryLearnCommandWithDependencies
} from "./memory";
import { runMcpCommand as runMcpCommandWithDependencies } from "./mcp";
import { runProductCommand as runProductCommandWithDependencies } from "./product";
import { runRedteamCommand as runRedteamCommandWithDependencies } from "./redteam";
import { runRevalidateCommand as runRevalidateCommandWithDependencies } from "./revalidate";
import { runSnapshotCommand as runSnapshotCommandWithDependencies } from "./snapshot";
import { createProductTargetReport as createProductTargetReportWithRuntime } from "../product/runtime";
import { renderProductTargetReport } from "../renderers/product-target-report";
import {
  createAnalysisContextForCli,
  formatGitErrorForCli,
  getChangedFilesForCli,
  getRepoRootForCli
} from "../runtime/analysis";
import { writeCliOutput } from "../runtime/output";
import type { CliCommandHandler } from "../types";

export interface CommandRegistryOptions {
  cliPath: string;
}

export function createCommandHandlers(options: CommandRegistryOptions): Record<string, CliCommandHandler> {
  return {
    agent: (context) => runAgentCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    analyze: (context) => runAnalyzeCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    benchmark: (context) => runBenchmarkCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    config: runConfigCommand,
    dashboard: (context) => runDashboardCommandWithDependencies(context, {
      resolveRepoRoot: getRepoRootForCli
    }),
    differential: (context) => runDifferentialCommandWithDependencies(context, {
      formatGitError: formatGitErrorForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    doctor: (context) => runDoctorCommandWithDependencies(context, {
      writeOutput: writeCliOutput
    }),
    execute: (context) => runExecuteCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      writeOutput: writeCliOutput
    }),
    "llm-review": (context) => runLlmReviewCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    mcp: (context) => runMcpCommandWithDependencies(context, {
      cliPath: options.cliPath
    }),
    memory: (context) => runMemoryCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
    "memory-import": (context) => runMemoryImportCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
    "memory-learn": (context) => runMemoryLearnCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
    product: (context) => runProductCommandWithDependencies(context, {
      createProductTargetReport: (cwd, loadedConfig, productOptions) => createProductTargetReportWithRuntime(
        cwd,
        loadedConfig,
        productOptions,
        {
          createAnalysisContext: (repoRoot) => createAnalysisContextForCli(repoRoot, { format: "markdown" }),
          getChangedFiles: (repoRoot) => getChangedFilesForCli(repoRoot, { format: "markdown" })
        }
      ),
      renderProductTargetReport,
      writeOutput: writeCliOutput
    }),
    redteam: (context) => runRedteamCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    revalidate: (context) => runRevalidateCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    }),
    snapshot: (context) => runSnapshotCommandWithDependencies(context, {
      createAnalysisContext: createAnalysisContextForCli,
      resolveRepoRoot: getRepoRootForCli,
      writeOutput: writeCliOutput
    })
  };
}
