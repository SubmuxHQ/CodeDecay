import type { ProductFailureBundle } from "./types";
import { productFailureBundlesFromGeneratedRun } from "./product-failures/generated";
import { sortProductFailureBundles } from "./product-failures/sort";
import { asRecord } from "./product-failures/utils";
import { productFailureBundleFromTargetStatus } from "./product-failures/workflow";

export { sortProductFailureBundles } from "./product-failures/sort";

export function productFailureBundlesFromProductTargetReport(value: unknown): ProductFailureBundle[] {
  const report = asRecord(value);
  const targets = Array.isArray(report?.targets) ? report.targets : [];
  const bundles: ProductFailureBundle[] = [];

  for (const targetValue of targets) {
    const target = asRecord(targetValue);
    if (!target) {
      continue;
    }

    const generatedFailures = [
      ...productFailureBundlesFromGeneratedRun(target, "generatedTestRun", "ui"),
      ...productFailureBundlesFromGeneratedRun(target, "generatedApiTestRun", "api")
    ];
    bundles.push(...generatedFailures);

    if (generatedFailures.length === 0) {
      const setupFailure = productFailureBundleFromTargetStatus(target);
      if (setupFailure) {
        bundles.push(setupFailure);
      }
    }
  }

  return sortProductFailureBundles(bundles);
}
