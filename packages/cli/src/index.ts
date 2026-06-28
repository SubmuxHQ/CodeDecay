import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import {
  loadCodeDecayConfig,
  type CodeDecayProductTarget,
  type LoadedCodeDecayConfig
} from "@submuxhq/codedecay-config";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  CODEDECAY_VERSION,
  createAnalysisReport,
  productFailureBundlesFromProductTargetReport,
  type CodeDecayReport,
  type ProductFailureBundle,
} from "@submuxhq/codedecay-core";
import { checkCommandSafety, runConfiguredCommand, type CommandExecutionResult, type ExecutionStatus } from "@submuxhq/codedecay-execution";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import {
  applyMemoryContext,
  loadCodeDecayMemory,
  type CodeDecayMemory,
  type MemoryMatcher
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
import { COMMAND_ORDER, HELP_DOCS, ROOT_FLAG_ALIASES, UTILITY_COMMAND_ORDER } from "./docs/commands";
import { CliExit } from "./errors";
import { write, writeStderr, writeStdout } from "./io";
import { throwUnknownCommand as throwUnknownCommandWithDocs } from "./parsers/diagnostics";
import { HelpRequested } from "./parsers/args";
import {
  captureProductScreenshot,
  extractHtmlTitle,
  extractProductFlowPage,
  normalizeExploreUrl,
  resolveProductExploreBaseUrl,
  sanitizeArtifactSegment,
  type ProductPlaywrightPage
} from "./product/exploration";
import {
  escapeRegExp,
  generateProductApiTestsForTarget,
  generateProductTestsForTarget,
  loadGeneratedProductApiTestsForTarget,
  loadGeneratedProductTestsForTarget,
  normalizeProductPriorityPath,
  priorityRank,
  relativePathForArtifact,
  runGeneratedProductTests,
  type ProductGeneratedTestDependencies
} from "./product/generated-tests";
import type {
  AnalyzeOptions,
  AgentOptions,
  CliAnalysisContext,
  CliCommandContext,
  CliCommandHandler,
  CliRuntime,
  ConfigFormat,
  LlmReviewOptions,
  McpOptions,
  ManagedProductProcess,
  ProductBlockedAction,
  ProductExplorationResult,
  ProductExplorerOptions,
  ProductFlowMap,
  ProductFlowPage,
  ProductGeneratedTestFailure,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult,
  ProductHealthResult,
  ProductOptions,
  ProductStartResult,
  ProductTargetReport,
  ProductTargetResult,
  ProductTargetStatus,
  ProductTargetSummary,
  RedteamOptions,
  SnapshotOptions
} from "./types";
import {
  renderCommandHelp,
  renderCommandManual,
  renderRootHelp as renderRootHelpDocument,
  renderRootManual as renderRootManualDocument,
  type CommandDoc
} from "./renderers/discovery";
import { appendCodeBlock, appendOutputBlock, formatStatus } from "./renderers/command-output";

const PRODUCT_GENERATED_TEST_DEPENDENCIES: ProductGeneratedTestDependencies = {
  findPrioritizedProductPaths,
  findImpactedProductFiles
};

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
    createProductTargetReport,
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

function throwUnknownCommand(command: string): never {
  return throwUnknownCommandWithDocs({
    command,
    docs: HELP_DOCS,
    rootFlagAliases: ROOT_FLAG_ALIASES
  });
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

async function createProductTargetReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  options: ProductOptions
): Promise<ProductTargetReport> {
  const startedAt = Date.now();
  const allTargets = Object.values(loadedConfig.config.productTesting.targets).sort((left, right) => left.id.localeCompare(right.id));
  const targets = selectProductTargets(allTargets, options.target);
  if ((options.explore || options.generateTests || options.runGeneratedTests || options.generateApiTests || options.runGeneratedApiTests) && targets.length === 0) {
    throw new Error("codedecay product execution workflows require at least one configured productTesting target.");
  }

  const results: ProductTargetResult[] = [];

  for (const target of targets) {
    results.push(await runProductTarget(rootDir, loadedConfig, target, options));
  }

  const report: ProductTargetReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: createProductTargetSummary(results, elapsed(startedAt)),
    targets: results,
    safety: {
      commandsExecuted: results.some((result) => commandActuallyExecuted(result.setup) || commandActuallyExecuted(result.teardown) || result.start?.status === "started"),
      browserAutomationRan: results.some((result) => result.exploration?.status === "passed" || result.exploration?.status === "failed"),
      generatedTestsRan: results.some((result) => result.generatedTestRun !== undefined || result.generatedApiTestRun !== undefined),
      startupCommandsAllowed: loadedConfig.config.safety.allowCommands,
      telemetrySent: false,
      cloudDependency: false,
      notes: [
        "Product target checks are explicit and local-first.",
        "CodeDecay only runs configured product target commands when safety.allowCommands is true.",
        "Existing baseUrl and preview URL targets can be health-checked without startup commands.",
        "Product exploration uses a project-provided Playwright install and never installs browsers.",
        "Generated tests are review artifacts unless --run-generated-tests or --run-generated-api-tests is explicitly used."
      ]
    }
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  return report;
}

function selectProductTargets(targets: CodeDecayProductTarget[], requestedTarget: string | undefined): CodeDecayProductTarget[] {
  if (!requestedTarget) {
    return targets;
  }

  const target = targets.find((candidate) => candidate.id === requestedTarget);
  if (!target) {
    const available = targets.length > 0 ? targets.map((candidate) => candidate.id).join(", ") : "none";
    throw new Error(`Unknown product target "${requestedTarget}". Available targets: ${available}.`);
  }

  return [target];
}

async function runProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  options: ProductOptions
): Promise<ProductTargetResult> {
  const startedAt = Date.now();
  const notes = [...target.readiness.notes];
  let setup: CommandExecutionResult | undefined;
  let startResult: ManagedProductProcess | undefined;
  let health: ProductHealthResult | undefined;
  let exploration: ProductExplorationResult | undefined;
  let generatedTests: ProductGeneratedTestsResult | undefined;
  let generatedTestRun: ProductGeneratedTestRunResult | undefined;
  let generatedApiTests: ProductGeneratedTestsResult | undefined;
  let generatedApiTestRun: ProductGeneratedTestRunResult | undefined;
  let teardown: CommandExecutionResult | undefined;
  let status: ProductTargetStatus = "skipped";
  let shouldRunHealthCheck = true;

  try {
    if (target.authSetupCommand) {
      setup = await runProductOneShotCommand(rootDir, loadedConfig, target.authSetupCommand, target.timeoutMs);
      if (setup.status !== "passed") {
        status = productStatusFromRequiredCommand(setup.status);
        notes.push("Auth setup command did not pass; health checking was skipped.");
        shouldRunHealthCheck = false;
      }
    }

    if (shouldRunHealthCheck && target.startCommand) {
      startResult = await startManagedProductProcess(rootDir, loadedConfig, target.startCommand, target.timeoutMs);
      if (startResult.status !== "started") {
        status = startResult.status === "blocked" ? "blocked" : "failed";
        notes.push("Start command did not produce a managed running process; health checking was skipped.");
        shouldRunHealthCheck = false;
      }
    }

    if (shouldRunHealthCheck) {
      const healthUrl = target.healthCheck ?? target.readiness.effectiveBaseUrl ?? target.baseUrl;
      if (!healthUrl) {
        status = target.readiness.status === "needs-command-approval" || target.readiness.status === "missing-preview-url" ? "blocked" : "skipped";
        notes.push("No healthCheck, baseUrl, or resolved preview URL is available for product target polling.");
        shouldRunHealthCheck = false;
      } else {
        health = await pollProductHealth(healthUrl, target.timeoutMs);
        status = health.status;
      }
    }

    if (options.explore) {
      if (health?.status === "passed") {
        exploration = await exploreProductTarget(rootDir, loadedConfig, target, health, {
          maxPages: options.maxPages,
          maxActions: options.maxActions,
          allowDestructiveActions: options.allowDestructiveActions
        });
        if (exploration.status !== "passed") {
          status = exploration.status;
        }
      } else if (!isProductTargetFailure(status)) {
        status = "blocked";
        exploration = {
          status: "blocked",
          driver: "playwright",
          pages: 0,
          interactiveElements: 0,
          blockedActions: 0,
          skippedActions: 0,
          durationMs: 0,
          error: "Product exploration requires a healthy target URL.",
          notes: ["Run a target with baseUrl, resolved previewUrlEnv, or healthCheck before exploration."]
        };
      }
    }

    if (options.generateTests || options.runGeneratedTests) {
      generatedTests = options.generateTests
        ? generateProductTestsForTarget(rootDir, target, exploration?.artifactPath, PRODUCT_GENERATED_TEST_DEPENDENCIES)
        : loadGeneratedProductTestsForTarget(rootDir, target);
      if (generatedTests.status !== "passed") {
        status = generatedTests.status;
      } else if (options.runGeneratedTests) {
        generatedTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedTests, "--run-generated-tests", options.testId, PRODUCT_GENERATED_TEST_DEPENDENCIES);
        if (generatedTestRun.status !== "passed") {
          status = generatedTestRun.status;
        }
      }
    }

    if (options.generateApiTests || options.runGeneratedApiTests) {
      generatedApiTests = options.generateApiTests
        ? generateProductApiTestsForTarget(rootDir, loadedConfig, target, health, options.allowDestructiveActions, PRODUCT_GENERATED_TEST_DEPENDENCIES)
        : loadGeneratedProductApiTestsForTarget(rootDir, target);
      if (generatedApiTests.status !== "passed") {
        status = generatedApiTests.status;
      } else if (options.runGeneratedApiTests) {
        generatedApiTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedApiTests, "--run-generated-api-tests", options.testId, PRODUCT_GENERATED_TEST_DEPENDENCIES);
        if (generatedApiTestRun.status !== "passed") {
          status = generatedApiTestRun.status;
        }
      }
    }
  } finally {
    if (startResult?.child) {
      await stopManagedProductProcess(startResult.child);
    }

    if (target.teardownCommand && (startResult?.status === "started" || setup?.status === "passed")) {
      teardown = await runProductOneShotCommand(rootDir, loadedConfig, target.teardownCommand, target.timeoutMs);
      if (teardown.status !== "passed" && !isProductTargetFailure(status)) {
        status = productStatusFromRequiredCommand(teardown.status);
        notes.push("Teardown command did not pass after product target execution.");
      }
    }
  }

  return createProductTargetResult(
    target,
    status,
    startedAt,
    notes,
    setup,
    startResult,
    health,
    exploration,
    generatedTests,
    generatedTestRun,
    generatedApiTests,
    generatedApiTestRun,
    teardown
  );
}

function createProductTargetResult(
  target: CodeDecayProductTarget,
  status: ProductTargetStatus,
  startedAt: number,
  notes: string[],
  setup: CommandExecutionResult | undefined,
  start: ManagedProductProcess | undefined,
  health: ProductHealthResult | undefined,
  exploration: ProductExplorationResult | undefined,
  generatedTests: ProductGeneratedTestsResult | undefined,
  generatedTestRun: ProductGeneratedTestRunResult | undefined,
  generatedApiTests: ProductGeneratedTestsResult | undefined,
  generatedApiTestRun: ProductGeneratedTestRunResult | undefined,
  teardown: CommandExecutionResult | undefined
): ProductTargetResult {
  const result: ProductTargetResult = {
    id: target.id,
    status,
    readiness: target.readiness,
    baseUrl: target.readiness.effectiveBaseUrl ?? target.baseUrl,
    healthCheck: target.healthCheck,
    timeoutMs: target.timeoutMs,
    durationMs: elapsed(startedAt),
    notes
  };

  if (setup) {
    result.setup = setup;
  }

  if (start) {
    const { child: _child, ...serializableStart } = start;
    result.start = serializableStart;
  }

  if (health) {
    result.health = health;
  }

  if (exploration) {
    result.exploration = exploration;
  }

  if (generatedTests) {
    result.generatedTests = generatedTests;
  }

  if (generatedTestRun) {
    result.generatedTestRun = generatedTestRun;
  }

  if (generatedApiTests) {
    result.generatedApiTests = generatedApiTests;
  }

  if (generatedApiTestRun) {
    result.generatedApiTestRun = generatedApiTestRun;
  }

  if (teardown) {
    result.teardown = teardown;
  }

  return result;
}

async function runProductOneShotCommand(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<CommandExecutionResult> {
  return await runConfiguredCommand({
    command,
    cwd: rootDir,
    timeoutMs,
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
}

async function startManagedProductProcess(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<ManagedProductProcess> {
  const startedAt = Date.now();
  if (!loadedConfig.config.safety.allowCommands) {
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: "Product target startup is disabled by config safety.allowCommands.",
      blockedReason: "safety.allowCommands is false"
    };
  }

  const safety = checkCommandSafety(command);
  if (!safety.safe) {
    const message = `Command was blocked by CodeDecay safety policy: ${safety.reason}.`;
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: safety.reason
    };
  }

  let stdout = "";
  let stderr = "";
  let spawnError: Error | undefined;
  const child = spawn(command, {
    cwd: rootDir,
    shell: true,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1"
    }
  });

  child.stdout.on("data", (chunk: Buffer) => {
    stdout = appendLimitedOutput(stdout, chunk.toString("utf8"), 16 * 1024);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendLimitedOutput(stderr, chunk.toString("utf8"), 16 * 1024);
  });

  child.on("error", (error) => {
    spawnError = error;
  });

  await delay(Math.min(250, Math.max(50, Math.floor(timeoutMs / 10))));

  if (spawnError) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: spawnError.message
    };
  }

  if (child.exitCode !== null) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: `Start command exited early with code ${child.exitCode}.`
    };
  }

  return {
    command,
    status: "started",
    durationMs: elapsed(startedAt),
    stdout,
    stderr,
    pid: child.pid,
    child
  };
}

async function stopManagedProductProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 1000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function pollProductHealth(url: string, timeoutMs: number): Promise<ProductHealthResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  while (Date.now() <= deadline) {
    attempts += 1;
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(2500, remainingMs));

    try {
      const response = await fetch(url, {
        signal: controller.signal
      });
      lastStatus = response.status;

      if (response.status >= 200 && response.status < 400) {
        clearTimeout(timeout);
        return {
          url,
          status: "passed",
          attempts,
          durationMs: elapsed(startedAt),
          httpStatus: response.status
        };
      }

      lastError = `Health check returned HTTP ${response.status}.`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }

    await delay(Math.min(500, Math.max(0, deadline - Date.now())));
  }

  return {
    url,
    status: "timed_out",
    attempts,
    durationMs: elapsed(startedAt),
    httpStatus: lastStatus,
    error: lastError ? `Timed out waiting for a healthy response: ${lastError}` : "Timed out waiting for a healthy response."
  };
}

async function exploreProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult,
  options: ProductExplorerOptions
): Promise<ProductExplorationResult> {
  const startedAt = Date.now();
  const baseUrl = resolveProductExploreBaseUrl(target, health);
  const notes = [
    "Explorer uses same-origin crawling by default.",
    "Destructive forms and actions are recorded as blocked unless --allow-destructive-actions is set."
  ];

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires safety.allowCommands to be true.",
      notes
    };
  }

  if (!baseUrl) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires a baseUrl, resolved previewUrlEnv, or healthCheck URL.",
      notes
    };
  }

  const playwright = loadProjectPlaywright(rootDir);
  if (!playwright.ok) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: playwright.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install browsers or packages."]
    };
  }

  let browser: ProductPlaywrightBrowser | undefined;
  try {
    browser = await playwright.module.chromium.launch({ headless: true });
    const artifactRoot = join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(target.id));
    const flowMap = await crawlProductFlowMap({
      browser,
      rootDir,
      artifactRoot,
      target,
      baseUrl,
      options,
      timeoutMs: target.timeoutMs
    });
    const artifactPath = join(artifactRoot, "flow-map.json");
    writeOutput(rootDir, artifactPath, `${JSON.stringify(flowMap, null, 2)}\n`);

    return {
      status: "passed",
      driver: "playwright",
      artifactPath,
      pages: flowMap.summary.pages,
      interactiveElements: flowMap.summary.interactiveElements,
      blockedActions: flowMap.summary.blockedActions,
      skippedActions: flowMap.summary.skippedActions,
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: `Playwright product exploration failed: ${message}`,
      notes: [...notes, "CodeDecay does not install Playwright browsers; run the project's normal Playwright setup if browser launch fails."]
    };
  } finally {
    await browser?.close?.();
  }
}

interface ProductPlaywrightModule {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<ProductPlaywrightBrowser>;
  };
}

interface ProductPlaywrightBrowser {
  newPage: () => Promise<ProductPlaywrightPage>;
  close?: () => Promise<void>;
}

function loadProjectPlaywright(rootDir: string): { ok: true; module: ProductPlaywrightModule } | { ok: false; error: string } {
  try {
    const projectRequire = createRequire(join(rootDir, "package.json"));
    const loaded = projectRequire("playwright") as Partial<ProductPlaywrightModule>;
    if (!loaded.chromium?.launch) {
      return {
        ok: false,
        error: "Project Playwright package does not expose chromium.launch."
      };
    }

    return {
      ok: true,
      module: loaded as ProductPlaywrightModule
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Playwright is not installed or cannot be loaded from the target project: ${message}`
    };
  }
}

async function crawlProductFlowMap(input: {
  browser: ProductPlaywrightBrowser;
  rootDir: string;
  artifactRoot: string;
  target: CodeDecayProductTarget;
  baseUrl: string;
  options: ProductExplorerOptions;
  timeoutMs: number;
}): Promise<ProductFlowMap> {
  const startUrl = normalizeExploreUrl(input.baseUrl);
  const origin = new URL(startUrl).origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const queued = new Set([startUrl]);
  const visited = new Set<string>();
  const pages: ProductFlowPage[] = [];
  const crawlState = {
    recordedActions: 0,
    skippedActions: 0,
    blockedActions: [] as ProductBlockedAction[]
  };
  const page = await input.browser.newPage();

  try {
    while (queue.length > 0 && pages.length < input.options.maxPages) {
      const next = queue.shift();
      if (!next || visited.has(next.url)) {
        continue;
      }

      visited.add(next.url);
      await page.goto(next.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(input.timeoutMs, 30_000)
      });
      const currentUrl = normalizeExploreUrl(page.url?.() ?? next.url);
      if (new URL(currentUrl).origin !== origin) {
        continue;
      }

      const html = await page.content();
      const title = page.title ? await page.title().catch(() => extractHtmlTitle(html)) : extractHtmlTitle(html);
      const extracted = extractProductFlowPage({
        url: currentUrl,
        html,
        origin,
        depth: next.depth,
        options: input.options,
        state: crawlState
      });
      const screenshotPath = await captureProductScreenshot({
        page,
        rootDir: input.rootDir,
        artifactRoot: input.artifactRoot,
        url: currentUrl
      });

      pages.push({
        ...extracted,
        title: title || extracted.title,
        ...(screenshotPath ? { screenshotPath } : {})
      });

      for (const link of extracted.links) {
        if (!link.discovered || queued.has(link.href) || visited.has(link.href)) {
          continue;
        }

        queued.add(link.href);
        queue.push({ url: link.href, depth: next.depth + 1 });
      }
    }
  } finally {
    await page.close?.();
  }

  const interactiveElements = pages.reduce((count, item) => count + item.interactiveElements.length, 0);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: input.target.id,
      baseUrl: startUrl,
      origin
    },
    driver: "playwright",
    limits: {
      sameOrigin: true,
      maxPages: input.options.maxPages,
      maxActions: input.options.maxActions,
      allowDestructiveActions: input.options.allowDestructiveActions
    },
    summary: {
      pages: pages.length,
      interactiveElements,
      blockedActions: crawlState.blockedActions.length,
      skippedActions: crawlState.skippedActions
    },
    pages,
    blockedActions: crawlState.blockedActions
  };
}

function findImpactedProductPaths(rootDir: string): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = createAnalysisContextForCli(repoRoot, { format: "markdown" });
    return new Set((analysis.report.impactedRoutes ?? []).map((route) => route.route));
  } catch {
    return new Set();
  }
}

function findPrioritizedProductPaths(rootDir: string): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = createAnalysisContextForCli(repoRoot, { format: "markdown" });
    const paths = new Set((analysis.report.impactedRoutes ?? []).map((route) => normalizeProductPriorityPath(route.route)));
    const changedFiles = analysis.report.changedFiles;
    const impactedAreaKinds = new Set(analysis.report.impactedAreas.map((area) => area.kind));
    const memory = loadCodeDecayMemory(repoRoot).memory;

    for (const regression of memory.regressions) {
      for (const path of regression.productPaths ?? []) {
        paths.add(normalizeProductPriorityPath(path));
      }
    }

    for (const entry of productMemoryEntries(memory)) {
      if (!memoryEntryMatchesProductScope(entry, changedFiles, impactedAreaKinds)) {
        continue;
      }

      for (const path of entry.productPaths ?? []) {
        paths.add(normalizeProductPriorityPath(path));
      }
    }

    return paths;
  } catch {
    return findImpactedProductPaths(rootDir);
  }
}

function productMemoryEntries(memory: CodeDecayMemory): MemoryMatcher[] {
  return [...memory.flows, ...memory.invariants, ...memory.architecture, ...memory.commands];
}

function memoryEntryMatchesProductScope(
  entry: MemoryMatcher,
  changedFiles: CodeDecayReport["changedFiles"],
  impactedAreaKinds: Set<CodeDecayReport["impactedAreas"][number]["kind"]>
): boolean {
  if (entry.areas?.some((area) => impactedAreaKinds.has(area))) {
    return true;
  }

  return changedFiles.some((file) => entry.files?.some((pattern) => matchesProductMemoryPathPattern(file.path, pattern)));
}

function matchesProductMemoryPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

function findImpactedProductFiles(rootDir: string): string[] {
  try {
    const repoRoot = getRepoRoot(rootDir);
    return getChangedFilesForCli(repoRoot, { format: "markdown" }).map((change) => change.path).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function createProductTargetSummary(results: ProductTargetResult[], durationMs: number): ProductTargetSummary {
  const passed = countProductStatus(results, "passed");
  const failed = countProductStatus(results, "failed");
  const skipped = countProductStatus(results, "skipped");
  const blocked = countProductStatus(results, "blocked");
  const timedOut = countProductStatus(results, "timed_out");

  return {
    status: productTargetStatus(results, { failed, blocked, timedOut }),
    total: results.length,
    ready: results.filter((result) => result.readiness.status === "ready" || result.readiness.status === "command-required").length,
    passed,
    failed,
    skipped,
    blocked,
    timedOut,
    durationMs
  };
}

function productTargetStatus(
  results: ProductTargetResult[],
  counts: Pick<ProductTargetSummary, "failed" | "blocked" | "timedOut">
): ProductTargetStatus {
  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.blocked > 0) {
    return "blocked";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function countProductStatus(results: ProductTargetResult[], status: ProductTargetStatus): number {
  return results.filter((result) => result.status === status).length;
}

function productStatusFromRequiredCommand(status: ExecutionStatus): ProductTargetStatus {
  if (status === "passed") {
    return "passed";
  }

  if (status === "timed_out") {
    return "timed_out";
  }

  if (status === "skipped" || status === "blocked") {
    return "blocked";
  }

  return "failed";
}

function commandActuallyExecuted(result: CommandExecutionResult | undefined): boolean {
  return result !== undefined && result.status !== "skipped" && result.status !== "blocked";
}

function isProductTargetFailure(status: ProductTargetStatus): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out";
}

function renderProductTargetReport(report: ProductTargetReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderProductTargetMarkdown(report);
}

function renderProductTargetMarkdown(report: ProductTargetReport): string {
  const lines = [
    "## CodeDecay Product Target Report",
    "",
    `**Overall status:** ${formatProductStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Ready | ${report.summary.ready} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Blocked | ${report.summary.blocked} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.targets.length === 0) {
    lines.push("No product testing targets configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Targets", "");
  for (const target of report.targets) {
    lines.push(`- **${target.id}** ${formatProductStatus(target.status)} in ${target.durationMs}ms`);
    lines.push(`  - Readiness: ${target.readiness.status} (${target.readiness.mode})`);
    lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
    lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);

    if (target.setup) {
      lines.push(`  - Setup: ${formatCommandExecutionStatus(target.setup.status)} \`${target.setup.command}\``);
      appendOutputBlock(lines, "setup stdout", target.setup.stdout);
      appendOutputBlock(lines, "setup stderr", target.setup.stderr);
    }

    if (target.start) {
      lines.push(`  - Start: ${formatProductStartStatus(target.start.status)} \`${target.start.command}\``);
      if (target.start.error) {
        lines.push(`  - Start error: ${target.start.error}`);
      }
      appendOutputBlock(lines, "start stdout", target.start.stdout);
      appendOutputBlock(lines, "start stderr", target.start.stderr);
    }

    if (target.health) {
      lines.push(
        `  - Health: ${formatProductStatus(target.health.status)} after ${target.health.attempts} attempt(s) at \`${target.health.url}\``
      );
      if (target.health.httpStatus !== undefined) {
        lines.push(`  - HTTP status: ${target.health.httpStatus}`);
      }
      if (target.health.error) {
        lines.push(`  - Health error: ${target.health.error}`);
      }
    }

    if (target.exploration) {
      lines.push(`  - Exploration: ${formatProductStatus(target.exploration.status)} using ${target.exploration.driver}`);
      lines.push(`  - Flow pages: ${target.exploration.pages}`);
      lines.push(`  - Interactive elements: ${target.exploration.interactiveElements}`);
      lines.push(`  - Blocked actions: ${target.exploration.blockedActions}`);
      lines.push(`  - Skipped actions: ${target.exploration.skippedActions}`);
      if (target.exploration.artifactPath) {
        lines.push(`  - Flow map: \`${target.exploration.artifactPath}\``);
      }
      if (target.exploration.error) {
        lines.push(`  - Exploration error: ${target.exploration.error}`);
      }
      for (const note of target.exploration.notes) {
        lines.push(`  - Exploration note: ${note}`);
      }
    }

    if (target.generatedTests) {
      lines.push(`  - Generated tests: ${formatProductStatus(target.generatedTests.status)} (${target.generatedTests.tests.length} test(s))`);
      if (target.generatedTests.sourcePath) {
        lines.push(`  - Generated test source: \`${target.generatedTests.sourcePath}\``);
      }
      if (target.generatedTests.manifestPath) {
        lines.push(`  - Generated test manifest: \`${target.generatedTests.manifestPath}\``);
      }
      if (target.generatedTests.error) {
        lines.push(`  - Generated test error: ${target.generatedTests.error}`);
      }
      for (const generatedTest of target.generatedTests.tests.slice(0, 8)) {
        lines.push(`  - Test: ${generatedTest.priority} ${generatedTest.kind} \`${generatedTest.id}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedTests.notes) {
        lines.push(`  - Generated test note: ${note}`);
      }
    }

    if (target.generatedTestRun) {
      lines.push(`  - Generated test run: ${formatProductStatus(target.generatedTestRun.status)}`);
      if (target.generatedTestRun.command) {
        lines.push(`  - Generated test command: \`${target.generatedTestRun.command}\``);
      }
      lines.push(`  - Generated test results: ${target.generatedTestRun.passed} passed, ${target.generatedTestRun.failed} failed, ${target.generatedTestRun.skipped} skipped`);
      if (target.generatedTestRun.error) {
        lines.push(`  - Generated test run error: ${target.generatedTestRun.error}`);
      }
      for (const failure of target.generatedTestRun.failures) {
        lines.push(`  - Failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        appendGeneratedFailureMetadata(lines, failure);
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedTestRun.notes) {
        lines.push(`  - Generated test run note: ${note}`);
      }
    }

    if (target.generatedApiTests) {
      lines.push(`  - Generated API tests: ${formatProductStatus(target.generatedApiTests.status)} (${target.generatedApiTests.tests.length} test(s))`);
      if (target.generatedApiTests.sourcePath) {
        lines.push(`  - Generated API test source: \`${target.generatedApiTests.sourcePath}\``);
      }
      if (target.generatedApiTests.manifestPath) {
        lines.push(`  - Generated API test manifest: \`${target.generatedApiTests.manifestPath}\``);
      }
      if (target.generatedApiTests.error) {
        lines.push(`  - Generated API test error: ${target.generatedApiTests.error}`);
      }
      for (const generatedTest of target.generatedApiTests.tests.slice(0, 8)) {
        const method = generatedTest.method ? `${generatedTest.method} ` : "";
        lines.push(`  - API test: ${generatedTest.priority} ${method}\`${generatedTest.operationPath ?? generatedTest.pageUrl}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedApiTests.notes) {
        lines.push(`  - Generated API test note: ${note}`);
      }
    }

    if (target.generatedApiTestRun) {
      lines.push(`  - Generated API test run: ${formatProductStatus(target.generatedApiTestRun.status)}`);
      if (target.generatedApiTestRun.command) {
        lines.push(`  - Generated API test command: \`${target.generatedApiTestRun.command}\``);
      }
      lines.push(`  - Generated API test results: ${target.generatedApiTestRun.passed} passed, ${target.generatedApiTestRun.failed} failed, ${target.generatedApiTestRun.skipped} skipped`);
      if (target.generatedApiTestRun.error) {
        lines.push(`  - Generated API test run error: ${target.generatedApiTestRun.error}`);
      }
      for (const failure of target.generatedApiTestRun.failures) {
        lines.push(`  - API failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        appendGeneratedFailureMetadata(lines, failure);
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedApiTestRun.notes) {
        lines.push(`  - Generated API test run note: ${note}`);
      }
    }

    if (target.teardown) {
      lines.push(`  - Teardown: ${formatCommandExecutionStatus(target.teardown.status)} \`${target.teardown.command}\``);
      appendOutputBlock(lines, "teardown stdout", target.teardown.stdout);
      appendOutputBlock(lines, "teardown stderr", target.teardown.stderr);
    }

    for (const note of target.notes) {
      lines.push(`  - Note: ${note}`);
    }
  }

  lines.push(
    "",
    "### Safety",
    "",
    `- Commands executed: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- Browser automation ran: ${report.safety.browserAutomationRan ? "yes" : "no"}`,
    `- Generated tests ran: ${report.safety.generatedTestsRan ? "yes" : "no"}`,
    `- Startup commands allowed: ${report.safety.startupCommandsAllowed ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    ""
  );

  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function appendGeneratedFailureMetadata(lines: string[], failure: ProductGeneratedTestFailure): void {
  if (failure.retryEvidence) {
    lines.push(
      `  - Repeat evidence: ${failure.retryEvidence.conclusion} (${failure.retryEvidence.passed} passed, ${failure.retryEvidence.failed} failed across ${failure.retryEvidence.attempts} attempt(s))`
    );
    if (failure.retryEvidence.error) {
      lines.push(`  - Repeat evidence error: ${failure.retryEvidence.error}`);
    }
  }

  if (failure.classification) {
    const confidence = failure.classificationConfidence !== undefined ? ` (${Math.round(failure.classificationConfidence * 100)}% confidence)` : "";
    lines.push(`  - Classification: ${failure.classification}${confidence}`);
  }

  for (const evidence of failure.classificationEvidence ?? []) {
    lines.push(`  - Classification evidence: ${evidence}`);
  }

  for (const task of failure.suggestedFixTasks ?? []) {
    lines.push(`  - Repair task: ${task}`);
  }
}

function formatProductStatus(status: ProductTargetStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatCommandExecutionStatus(status: ExecutionStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatProductStartStatus(status: ProductStartResult["status"]): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function appendLimitedOutput(existing: string, next: string, limit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= limit) {
    return combined;
  }

  return combined.slice(combined.length - limit);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
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

function printHelp(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(
      runtime,
      renderRootHelpDocument({
        docs: HELP_DOCS,
        commandOrder: COMMAND_ORDER,
        utilityCommandOrder: UTILITY_COMMAND_ORDER
      })
    );
    return;
  }

  writeStdout(runtime, renderCommandHelp(resolveHelpTopic(topic)));
}

function printManual(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(
      runtime,
      renderRootManualDocument({
        docs: HELP_DOCS,
        commandOrder: COMMAND_ORDER,
        utilityCommandOrder: UTILITY_COMMAND_ORDER
      })
    );
    return;
  }

  writeStdout(runtime, renderCommandManual(resolveHelpTopic(topic)));
}

function resolveHelpTopic(topic: string): CommandDoc {
  const doc = HELP_DOCS[topic];
  if (doc) {
    return doc;
  }

  throwUnknownCommand(topic);
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

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
