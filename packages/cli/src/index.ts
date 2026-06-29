import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  createAnalysisReport,
  productFailureBundlesFromProductTargetReport,
  type ProductFailureBundle,
} from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import {
  applyMemoryContext,
  loadCodeDecayMemory
} from "@submuxhq/codedecay-memory";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
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
import { write, writeStderr } from "./io";
import { HelpRequested } from "./parsers/args";
import { createProductTargetReport as createProductTargetReportWithRuntime } from "./product/runtime";
import type {
  AnalyzeOptions,
  AgentOptions,
  CliAnalysisContext,
  CliCommandContext,
  CliCommandHandler,
  CliRuntime,
  LlmReviewOptions,
  RedteamOptions,
  SnapshotOptions
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

function createAnalysisContextForCli(
  rootDir: string,
  options: AnalyzeOptions | AgentOptions | RedteamOptions | SnapshotOptions | LlmReviewOptions
): CliAnalysisContext {
  const changedFiles = getChangedFilesForCli(rootDir, options);
  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const analyzerResultWithMemory = applyMemoryContext({
    memory: loadedMemory.memory,
    changedFiles,
    impactedAreas: analyzerResult.impactedAreas,
    analyzerResult
  });

  return {
    loadedMemory,
    report: createAnalysisReport({
      base: options.base,
      head: options.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory,
      productFailureBundles: loadLatestProductFailureBundles(rootDir)
    })
  };
}

function loadLatestProductFailureBundles(rootDir: string): ProductFailureBundle[] {
  const reportPath = join(rootDir, CODEDECAY_PRODUCT_LATEST_REPORT_PATH);
  if (!existsSync(reportPath)) {
    return [];
  }

  try {
    return productFailureBundlesFromProductTargetReport(JSON.parse(readFileSync(reportPath, "utf8")));
  } catch {
    return [];
  }
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}

function writeCliOutput(input: {
  cwd: string;
  output?: string | undefined;
  rendered: string;
  runtime: CliRuntime;
}): void {
  if (input.output) {
    writeOutput(input.cwd, input.output, input.rendered);
    return;
  }

  write(input.runtime.stdout, input.rendered);
}

function getRepoRootForCli(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string {
  try {
    return getRepoRoot(cwd);
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, cwd, options);
  }
}

function getChangedFilesForCli(rootDir: string, options: { base?: string | undefined; head?: string | undefined; format: string }) {
  try {
    return getGitChangedFiles({
      cwd: rootDir,
      base: options.base,
      head: options.head
    });
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, rootDir, options);
  }
}

function formatGitErrorForCli(
  error: unknown,
  cwd: string,
  options: { base?: string | undefined; head?: string | undefined; format: string }
): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("rev-parse --show-toplevel") && message.includes("not a git repository")) {
    return new Error(`${cwd} is not a git repository. Run from a git repo or pass --cwd <repo>.`);
  }

  const unresolvedRef = findUnresolvedRef(message, options);
  if (unresolvedRef) {
    return new Error(
      `Could not resolve git ref "${unresolvedRef}". Check --base/--head and fetch the ref before running CodeDecay.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function findUnresolvedRef(
  message: string,
  options: { base?: string | undefined; head?: string | undefined }
): string | undefined {
  for (const ref of [options.base, options.head]) {
    if (ref && message.includes(ref)) {
      return ref;
    }
  }

  return undefined;
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
