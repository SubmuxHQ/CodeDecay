import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH, CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { filterProductFailures, loadLatestProductRun } from "../../product/latest-run";
import { renderProductFailuresMarkdown } from "../../product/report";
import type { McpProductFailuresReport } from "../../product/types";
import type { StartMcpServerOptions } from "../../server/types";
import type { ProductToolInput } from "../../tools/types";

export function runProductFailuresTool(serverOptions: StartMcpServerOptions, input: ProductToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loaded = loadLatestProductRun(rootDir);
  const failures = filterProductFailures(loaded.failures, input);
  const report: McpProductFailuresReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "mcp-product-failures",
    generatedAt: new Date().toISOString(),
    reportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
    reportFound: loaded.report !== undefined,
    failures,
    error: loaded.error
  };

  if (input.format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderProductFailuresMarkdown(report);
}
