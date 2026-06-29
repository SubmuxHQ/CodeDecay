import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createProductGeneratedTestDependencies, type ProductRuntimeDependencies } from "./runtime/dependencies";
import {
  commandActuallyExecuted,
  createProductTargetSummary
} from "./runtime/summary";
import { runProductTarget, selectProductTargets } from "./runtime/target";
import { elapsed } from "./runtime/timing";
import type {
  ProductOptions,
  ProductTargetReport,
  ProductTargetResult
} from "../types";

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
