import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentCommand as runAgentCommandWithDependencies } from "./commands/agent";
import { runAnalyzeCommand as runAnalyzeCommandWithDependencies } from "./commands/analyze";
import { runConfigCommand } from "./commands/config";
import { runDashboardCommand as runDashboardCommandWithDependencies } from "./commands/dashboard";
import { runDifferentialCommand as runDifferentialCommandWithDependencies } from "./commands/differential";
import { runExecuteCommand as runExecuteCommandWithDependencies } from "./commands/execute";
import { runLlmReviewCommand as runLlmReviewCommandWithDependencies } from "./commands/llm-review";
import { runUninstallCommand, runUpdateCommand, runVersionCommand } from "./commands/maintenance";
import {
  runMemoryCommand as runMemoryCommandWithDependencies,
  runMemoryImportCommand as runMemoryImportCommandWithDependencies,
  runMemoryLearnCommand as runMemoryLearnCommandWithDependencies
} from "./commands/memory";
import { runMcpCommand as runMcpCommandWithDependencies } from "./commands/mcp";
import { runProductCommand as runProductCommandWithDependencies } from "./commands/product";
import { runRedteamCommand as runRedteamCommandWithDependencies } from "./commands/redteam";
import { runSnapshotCommand as runSnapshotCommandWithDependencies } from "./commands/snapshot";
import { printHelp, printManual, throwUnknownCommand } from "./commands/help";
import { CliExit } from "./errors";
import { writeStderr } from "./io";
import { HelpRequested } from "./parsers/args";
import { createProductTargetReport as createProductTargetReportWithRuntime } from "./product/runtime";
import {
  createAnalysisContextForCli,
  formatGitErrorForCli,
  getChangedFilesForCli,
  getRepoRootForCli
} from "./runtime/analysis";
import { writeCliOutput } from "./runtime/output";
import type {
  CliCommandContext,
  CliCommandHandler,
  CliRuntime,
} from "./types";
import { renderProductTargetReport } from "./renderers/product-target-report";

const COMMAND_HANDLERS: Record<string, CliCommandHandler> = {
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
  config: runConfigCommand,
  dashboard: (context) => runDashboardCommandWithDependencies(context, {
    resolveRepoRoot: getRepoRootForCli
  }),
  differential: (context) => runDifferentialCommandWithDependencies(context, {
    formatGitError: formatGitErrorForCli,
    resolveRepoRoot: getRepoRootForCli,
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
    cliPath: fileURLToPath(import.meta.url)
  }),
  memory: (context) => runMemoryCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
  "memory-import": (context) => runMemoryImportCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
  "memory-learn": (context) => runMemoryLearnCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
  product: (context) => runProductCommandWithDependencies(context, {
    createProductTargetReport: (cwd, loadedConfig, options) => createProductTargetReportWithRuntime(cwd, loadedConfig, options, {
      createAnalysisContext: (repoRoot) => createAnalysisContextForCli(repoRoot, { format: "markdown" }),
      getChangedFiles: (repoRoot) => getChangedFilesForCli(repoRoot, { format: "markdown" })
    }),
    renderProductTargetReport,
    writeOutput: writeCliOutput
  }),
  redteam: (context) => runRedteamCommandWithDependencies(context, {
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

if (isDirectRun()) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export async function runCli(args: string[], runtime: CliRuntime = {}): Promise<number> {
  try {
    await run(args, runtime);
    return 0;
  } catch (error: unknown) {
    if (error instanceof CliExit) {
      return error.exitCode;
    }

    if (error instanceof HelpRequested) {
      printHelp(runtime);
      return 0;
    }

    const message = error instanceof Error ? error.message : String(error);
    writeStderr(runtime, `CodeDecay failed: ${message}\n`);
    return 2;
  }
}

async function run(args: string[], runtime: CliRuntime): Promise<void | number> {
  const [command, ...commandArgs] = args;
  const runtimeCwd = runtime.cwd ?? process.cwd();

  if (!command || command === "--help" || command === "-h") {
    printHelp(runtime);
    return;
  }

  if (command === "help") {
    const topic = commandArgs[0];
    printHelp(runtime, topic === "--help" || topic === "-h" ? undefined : topic);
    return;
  }

  if (command === "--version" || command === "-V" || command === "version") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "version");
      return;
    }

    runVersionCommand(runtime);
    return;
  }

  if (command === "man") {
    const topic = commandArgs[0];
    if (topic === "--help" || topic === "-h") {
      printHelp(runtime, "man");
      return;
    }

    printManual(runtime, topic);
    return;
  }

  if (command === "update") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "update");
      return;
    }

    await runUpdateCommand({
      args: commandArgs,
      runtime,
      runtimeCwd
    });
    return;
  }

  if (command === "uninstall") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "uninstall");
      return;
    }

    await runUninstallCommand({
      args: commandArgs,
      runtime,
      runtimeCwd
    });
    return;
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    printHelp(runtime, command);
    return;
  }

  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    throwUnknownCommand(command);
  }

  await handler({
    args: commandArgs,
    runtime,
    runtimeCwd
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && realPathOrResolve(entrypoint) === realPathOrResolve(fileURLToPath(import.meta.url)));
}

function realPathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
