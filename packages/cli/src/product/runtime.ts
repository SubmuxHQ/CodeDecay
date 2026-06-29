import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION, type CodeDecayReport, type FileChange } from "@submuxhq/codedecay-core";
import {
  checkCommandSafety,
  runConfiguredCommand,
  type CommandExecutionResult
} from "@submuxhq/codedecay-execution";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { loadCodeDecayMemory, type CodeDecayMemory, type MemoryMatcher } from "@submuxhq/codedecay-memory";
import {
  captureProductScreenshot,
  extractHtmlTitle,
  extractProductFlowPage,
  normalizeExploreUrl,
  resolveProductExploreBaseUrl,
  sanitizeArtifactSegment,
  type ProductPlaywrightPage
} from "./exploration";
import {
  escapeRegExp,
  generateProductApiTestsForTarget,
  generateProductTestsForTarget,
  loadGeneratedProductApiTestsForTarget,
  loadGeneratedProductTestsForTarget,
  normalizeProductPriorityPath,
  runGeneratedProductTests,
  type ProductGeneratedTestDependencies
} from "./generated-tests";
import {
  commandActuallyExecuted,
  createProductTargetSummary,
  isProductTargetFailure,
  productStatusFromRequiredCommand
} from "./runtime/summary";
import type {
  CliAnalysisContext,
  ManagedProductProcess,
  ProductBlockedAction,
  ProductExplorationResult,
  ProductExplorerOptions,
  ProductFlowMap,
  ProductFlowPage,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult,
  ProductHealthResult,
  ProductOptions,
  ProductTargetReport,
  ProductTargetResult,
  ProductTargetStatus
} from "../types";

export interface ProductRuntimeDependencies {
  createAnalysisContext(rootDir: string): CliAnalysisContext;
  getChangedFiles(rootDir: string): FileChange[];
}

export async function createProductTargetReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  options: ProductOptions,
  dependencies: ProductRuntimeDependencies
): Promise<ProductTargetReport> {
  const startedAt = Date.now();
  const allTargets = Object.values(loadedConfig.config.productTesting.targets).sort((left, right) => left.id.localeCompare(right.id));
  const targets = selectProductTargets(allTargets, options.target);
  if ((options.explore || options.generateTests || options.runGeneratedTests || options.generateApiTests || options.runGeneratedApiTests) && targets.length === 0) {
    throw new Error("codedecay product execution workflows require at least one configured productTesting target.");
  }

  const generatedTestDependencies = createProductGeneratedTestDependencies(dependencies);
  const results: ProductTargetResult[] = [];

  for (const target of targets) {
    results.push(await runProductTarget(rootDir, loadedConfig, target, options, generatedTestDependencies));
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

function createProductGeneratedTestDependencies(dependencies: ProductRuntimeDependencies): ProductGeneratedTestDependencies {
  return {
    findPrioritizedProductPaths: (rootDir) => findPrioritizedProductPaths(rootDir, dependencies),
    findImpactedProductFiles: (rootDir) => findImpactedProductFiles(rootDir, dependencies)
  };
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
  options: ProductOptions,
  generatedTestDependencies: ProductGeneratedTestDependencies
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
        ? generateProductTestsForTarget(rootDir, target, exploration?.artifactPath, generatedTestDependencies)
        : loadGeneratedProductTestsForTarget(rootDir, target);
      if (generatedTests.status !== "passed") {
        status = generatedTests.status;
      } else if (options.runGeneratedTests) {
        generatedTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedTests, "--run-generated-tests", options.testId, generatedTestDependencies);
        if (generatedTestRun.status !== "passed") {
          status = generatedTestRun.status;
        }
      }
    }

    if (options.generateApiTests || options.runGeneratedApiTests) {
      generatedApiTests = options.generateApiTests
        ? generateProductApiTestsForTarget(rootDir, loadedConfig, target, health, options.allowDestructiveActions, generatedTestDependencies)
        : loadGeneratedProductApiTestsForTarget(rootDir, target);
      if (generatedApiTests.status !== "passed") {
        status = generatedApiTests.status;
      } else if (options.runGeneratedApiTests) {
        generatedApiTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedApiTests, "--run-generated-api-tests", options.testId, generatedTestDependencies);
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

  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolvePromise();
    }, 1000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolvePromise();
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

function findImpactedProductPaths(rootDir: string, dependencies: ProductRuntimeDependencies): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = dependencies.createAnalysisContext(repoRoot);
    return new Set((analysis.report.impactedRoutes ?? []).map((route) => route.route));
  } catch {
    return new Set();
  }
}

function findPrioritizedProductPaths(rootDir: string, dependencies: ProductRuntimeDependencies): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = dependencies.createAnalysisContext(repoRoot);
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
    return findImpactedProductPaths(rootDir, dependencies);
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

function findImpactedProductFiles(rootDir: string, dependencies: ProductRuntimeDependencies): string[] {
  try {
    const repoRoot = getRepoRoot(rootDir);
    return dependencies.getChangedFiles(repoRoot).map((change) => change.path).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
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

  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}
