import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH, CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { createProductRunArgs, resolveCodeDecayCliInvocation } from "../../product/command";
import { filterProductFailures, loadLatestProductRun } from "../../product/latest-run";
import { renderMcpProductRunReport } from "../../product/report";
import { createProductSafety } from "../../product/safety";
import type { StartMcpServerOptions } from "../../server/types";
import type { ProductRunToolInput } from "../../tools/types";

export function runProductRunTool(serverOptions: StartMcpServerOptions, input: ProductRunToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const safety = createProductSafety(loadedConfig, Boolean(input.confirmExecution), [
    "This MCP tool invokes only the fixed CodeDecay product command with structured arguments.",
    "It writes the JSON report to the repo-local latest product run artifact."
  ]);
  const invocation = resolveCodeDecayCliInvocation(serverOptions, rootDir);
  const productArgs = createProductRunArgs(rootDir, input);
  const command = invocation ? [invocation.command, ...invocation.args, ...productArgs] : ["codedecay", ...productArgs];

  if (!input.confirmExecution) {
    return renderMcpProductRunReport(
      {
        tool: "CodeDecay",
        version: CODEDECAY_VERSION,
        mode: "mcp-product-run",
        generatedAt: new Date().toISOString(),
        executed: false,
        reportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
        command,
        stdout: "",
        stderr: "",
        failures: [],
        safety
      },
      input.format ?? "markdown"
    );
  }

  if (!invocation) {
    return renderMcpProductRunReport(
      {
        tool: "CodeDecay",
        version: CODEDECAY_VERSION,
        mode: "mcp-product-run",
        generatedAt: new Date().toISOString(),
        executed: false,
        reportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
        command,
        stdout: "",
        stderr: "",
        failures: [],
        safety,
        error: "Could not resolve a local CodeDecay CLI path for product execution."
      },
      input.format ?? "markdown"
    );
  }

  mkdirSync(dirname(join(rootDir, CODEDECAY_PRODUCT_LATEST_REPORT_PATH)), { recursive: true });
  const execution = spawnSync(invocation.command, [...invocation.args, ...productArgs], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env
  });
  const latest = loadLatestProductRun(rootDir);

  return renderMcpProductRunReport(
    {
      tool: "CodeDecay",
      version: CODEDECAY_VERSION,
      mode: "mcp-product-run",
      generatedAt: new Date().toISOString(),
      executed: true,
      reportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
      command,
      exitCode: execution.status ?? undefined,
      stdout: execution.stdout ?? "",
      stderr: execution.stderr ?? "",
      productReport: latest.report,
      failures: filterProductFailures(latest.failures, input),
      safety,
      error: latest.error ?? execution.error?.message
    },
    input.format ?? "markdown"
  );
}
