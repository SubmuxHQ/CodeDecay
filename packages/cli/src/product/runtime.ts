import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION, type CodeDecayReport, type FileChange } from "@submuxhq/codedecay-core";
import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { loadCodeDecayMemory, type CodeDecayMemory, type MemoryMatcher } from "@submuxhq/codedecay-memory";
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
import { exploreProductTarget } from "./runtime/exploration";
import { pollProductHealth } from "./runtime/health";
import { createProductTargetResult } from "./runtime/result";
import {
  commandActuallyExecuted,
  createProductTargetSummary,
  isProductTargetFailure,
  productStatusFromRequiredCommand
} from "./runtime/summary";
import { runProductOneShotCommand, startManagedProductProcess, stopManagedProductProcess } from "./runtime/service";
import { elapsed } from "./runtime/timing";
import type {
  CliAnalysisContext,
  ManagedProductProcess,
  ProductExplorationResult,
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
