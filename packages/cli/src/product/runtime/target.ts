import type { CodeDecayProductTarget, LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  generateProductApiTestsForTarget,
  generateProductTestsForTarget,
  loadGeneratedProductApiTestsForTarget,
  loadGeneratedProductTestsForTarget,
  runGeneratedProductTests,
  type ProductGeneratedTestDependencies
} from "../generated-tests";
import { exploreProductTarget } from "./exploration";
import { pollProductHealth } from "./health";
import { createProductTargetResult } from "./result";
import { isProductTargetFailure, productStatusFromRequiredCommand } from "./summary";
import { runProductOneShotCommand, startManagedProductProcess, stopManagedProductProcess } from "./service";
import type {
  ManagedProductProcess,
  ProductExplorationResult,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult,
  ProductHealthResult,
  ProductOptions,
  ProductTargetResult,
  ProductTargetStatus
} from "../../types";

export function selectProductTargets(targets: CodeDecayProductTarget[], requestedTarget: string | undefined): CodeDecayProductTarget[] {
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

export async function runProductTarget(
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
