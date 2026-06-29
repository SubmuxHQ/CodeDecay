import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH, CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { loadLatestProductRun } from "../../product/latest-run";
import type { StartMcpServerOptions } from "../../server/types";
import type { ProductRerunToolInput } from "../../tools/types";
import { runProductRunTool } from "./run";

export function runProductRerunTool(serverOptions: StartMcpServerOptions, input: ProductRerunToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const latest = loadLatestProductRun(rootDir);
  const selected =
    input.testId !== undefined
      ? latest.failures.find((failure) => failure.checkId === input.testId && (!input.target || failure.target.id === input.target))
      : latest.failures.find((failure) => !input.target || failure.target.id === input.target);
  const checkKind = input.checkKind ?? selected?.checkKind;
  const testId = input.testId ?? selected?.checkId;

  if (!testId || !checkKind || checkKind === "workflow") {
    const error = latest.error ?? "No generated UI/API failure is available to rerun from the latest product report.";
    const report = {
      tool: "CodeDecay",
      version: CODEDECAY_VERSION,
      mode: "mcp-product-rerun",
      generatedAt: new Date().toISOString(),
      executed: false,
      error,
      latestReportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH
    };
    return input.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${error}\n`;
  }

  return runProductRunTool(serverOptions, {
    cwd,
    target: input.target ?? selected?.target.id,
    testId,
    runGeneratedTests: checkKind === "ui",
    runGeneratedApiTests: checkKind === "api",
    confirmExecution: input.confirmExecution,
    format: input.format
  });
}
