import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  productFailureBundlesFromProductTargetReport,
  type ProductFailureBundle
} from "@submuxhq/codedecay-core";

export interface LatestProductRun {
  report?: unknown | undefined;
  failures: ProductFailureBundle[];
  error?: string | undefined;
}

export function loadLatestProductRun(rootDir: string): LatestProductRun {
  const reportPath = join(rootDir, CODEDECAY_PRODUCT_LATEST_REPORT_PATH);
  if (!existsSync(reportPath)) {
    return {
      failures: [],
      error: `Latest product report not found at ${CODEDECAY_PRODUCT_LATEST_REPORT_PATH}. Run codedecay_product_run first.`
    };
  }

  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    return {
      report,
      failures: productFailureBundlesFromProductTargetReport(report)
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      failures: [],
      error: `Could not read latest product report at ${CODEDECAY_PRODUCT_LATEST_REPORT_PATH}: ${message}`
    };
  }
}

export function filterProductFailures(
  failures: ProductFailureBundle[],
  input: { target?: string | undefined }
): ProductFailureBundle[] {
  return input.target ? failures.filter((failure) => failure.target.id === input.target) : failures;
}
