import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_PRODUCT_LATEST_REPORT_PATH, CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { createProductRunArgs, resolveCodeDecayCliInvocation } from "../product/command";
import { filterProductFailures, loadLatestProductRun } from "../product/latest-run";
import { renderMcpProductRunReport, renderProductFailuresMarkdown, renderProductPlanMarkdown } from "../product/report";
import { createProductSafety } from "../product/safety";
import type { McpProductFailuresReport, McpProductPlanReport } from "../product/types";
import type { StartMcpServerOptions } from "../server/types";
import type {
  ProductRerunToolInput,
  ProductRunToolInput,
  ProductToolInput
} from "../tools/types";

export function runProductPlanTool(serverOptions: StartMcpServerOptions, input: ProductToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const targets = Object.values(loadedConfig.config.productTesting.targets)
    .filter((target) => !input.target || target.id === input.target)
    .sort((left, right) => left.id.localeCompare(right.id));
  const plan: McpProductPlanReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "mcp-product-plan",
    generatedAt: new Date().toISOString(),
    configSource: loadedConfig.sourcePath,
    latestReportPath: CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
    targets: targets.map((target) => ({
      id: target.id,
      readiness: target.readiness,
      baseUrl: target.readiness.effectiveBaseUrl ?? target.baseUrl,
      healthCheck: target.healthCheck,
      timeoutMs: target.timeoutMs,
      apiEndpoints: target.apiEndpoints.length,
      artifacts: {
        flowMap: `.codedecay/local/product-flow-maps/${target.id}/flow-map.json`,
        generatedUiTests: `.codedecay/local/generated-tests/${target.id}/manifest.json`,
        generatedApiTests: `.codedecay/local/generated-api-tests/${target.id}/manifest.json`
      },
      suggestedCommands: [
        `npx codedecay product --target ${target.id} --format markdown`,
        `npx codedecay product --target ${target.id} --generate-api-tests --run-generated-api-tests --format markdown`,
        `npx codedecay product --target ${target.id} --run-generated-tests --test-id <generated-test-id> --format markdown`
      ]
    })),
    safety: createProductSafety(loadedConfig, false, [
      "This plan is report-only and does not run product target commands.",
      "Use codedecay_product_run with confirmExecution=true to run fixed product verification commands."
    ])
  };

  if (input.format === "json") {
    return `${JSON.stringify(plan, null, 2)}\n`;
  }

  return renderProductPlanMarkdown(plan);
}

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
