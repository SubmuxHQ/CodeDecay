import { resolve } from "node:path";
import {
  productFailureBundlesFromProductTargetReport,
  type ProductFailureClassification
} from "@submuxhq/codedecay-core";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CliExit } from "../errors";
import { parseProductArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, ConfigFormat, ProductOptions, ProductTargetReport } from "../types";

export interface RunProductCommandDependencies {
  createProductTargetReport(
    cwd: string,
    loadedConfig: LoadedCodeDecayConfig,
    options: ProductOptions
  ): Promise<ProductTargetReport>;
  renderProductTargetReport(report: ProductTargetReport, format: ConfigFormat): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runProductCommand(
  context: CliCommandContext,
  dependencies: RunProductCommandDependencies
): Promise<void> {
  const options = parseProductArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  const report = await dependencies.createProductTargetReport(cwd, loadedConfig, options);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: dependencies.renderProductTargetReport(report, options.format),
    runtime: context.runtime
  });

  if (isProductTargetFailure(report.summary.status)) {
    const shouldFail =
      options.failOnClassifications && options.failOnClassifications.length > 0
        ? shouldFailProductReportForClassifications(report, options.failOnClassifications)
        : true;
    if (shouldFail) {
      throw new CliExit(1);
    }
  }
}

function shouldFailProductReportForClassifications(
  report: ProductTargetReport,
  classifications: ProductFailureClassification[]
): boolean {
  const failures = productFailureBundlesFromProductTargetReport(report);
  const gate = new Set(classifications);
  return failures.some((failure) => gate.has(failure.classification));
}

function isProductTargetFailure(status: ProductTargetReport["summary"]["status"]): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out";
}
