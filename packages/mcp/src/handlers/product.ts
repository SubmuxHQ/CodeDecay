import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  CODEDECAY_VERSION,
  type ProductFailureBundle
} from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { filterProductFailures, loadLatestProductRun } from "../product/latest-run";
import type { StartMcpServerOptions } from "../server/types";
import type {
  ProductRerunToolInput,
  ProductRunToolInput,
  ProductToolInput
} from "../tools/types";

interface McpProductRunReport {
  tool: "CodeDecay";
  version: string;
  mode: "mcp-product-run";
  generatedAt: string;
  executed: boolean;
  reportPath: string;
  command: string[];
  exitCode?: number | undefined;
  stdout: string;
  stderr: string;
  productReport?: unknown;
  failures: ProductFailureBundle[];
  safety: McpProductSafety;
  error?: string | undefined;
}

interface McpProductSafety {
  confirmExecutionRequired: true;
  confirmExecution: boolean;
  allowCommands: boolean;
  notes: string[];
}

export function runProductPlanTool(serverOptions: StartMcpServerOptions, input: ProductToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const targets = Object.values(loadedConfig.config.productTesting.targets)
    .filter((target) => !input.target || target.id === input.target)
    .sort((left, right) => left.id.localeCompare(right.id));
  const plan = {
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
  const report = {
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

function createProductRunArgs(rootDir: string, input: ProductRunToolInput): string[] {
  const args = [
    "product",
    "--cwd",
    rootDir,
    "--format",
    "json",
    "--output",
    CODEDECAY_PRODUCT_LATEST_REPORT_PATH
  ];

  if (input.target) {
    args.push("--target", input.target);
  }

  if (input.explore) {
    args.push("--explore");
  }

  if (input.generateTests) {
    args.push("--generate-tests");
  }

  if (input.runGeneratedTests) {
    args.push("--run-generated-tests");
  }

  if (input.generateApiTests) {
    args.push("--generate-api-tests");
  }

  if (input.runGeneratedApiTests) {
    args.push("--run-generated-api-tests");
  }

  if (input.allowDestructiveActions) {
    args.push("--allow-destructive-actions");
  }

  if (input.maxPages !== undefined) {
    args.push("--max-pages", String(input.maxPages));
  }

  if (input.maxActions !== undefined) {
    args.push("--max-actions", String(input.maxActions));
  }

  if (input.testId) {
    args.push("--test-id", input.testId);
  }

  return args;
}

function createProductSafety(
  loadedConfig: LoadedCodeDecayConfig,
  confirmExecution: boolean,
  notes: string[]
): McpProductSafety {
  return {
    confirmExecutionRequired: true,
    confirmExecution,
    allowCommands: loadedConfig.config.safety.allowCommands,
    notes: [
      ...notes,
      "Product target startup, browser automation, and generated test execution still obey safety.allowCommands in CodeDecay config.",
      "No telemetry, cloud execution, LLM calls, or arbitrary MCP-provided commands are used."
    ]
  };
}

function resolveCodeDecayCliInvocation(
  serverOptions: StartMcpServerOptions,
  rootDir: string
): { command: string; args: string[] } | undefined {
  const configuredCliPath = serverOptions.cliPath ?? process.env.CODEDECAY_MCP_CLI_PATH;
  if (configuredCliPath && existsSync(configuredCliPath)) {
    return {
      command: process.execPath,
      args: [configuredCliPath]
    };
  }

  const projectBin = join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "codedecay.cmd" : "codedecay");
  if (existsSync(projectBin)) {
    return {
      command: projectBin,
      args: []
    };
  }

  return undefined;
}

function renderProductPlanMarkdown(plan: any): string {
  const lines = [
    "## CodeDecay MCP Product Plan",
    "",
    `**Latest report path:** \`${plan.latestReportPath}\``,
    `**Targets:** ${plan.targets.length}`,
    "",
    "### Targets",
    ""
  ];

  if (plan.targets.length === 0) {
    lines.push("- none configured");
  } else {
    for (const target of plan.targets) {
      lines.push(`- **${target.id}** ${target.readiness.status} (${target.readiness.mode})`);
      lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
      lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);
      lines.push(`  - API endpoints: ${target.apiEndpoints}`);
      lines.push(`  - Flow map: \`${target.artifacts.flowMap}\``);
      lines.push(`  - Generated UI tests: \`${target.artifacts.generatedUiTests}\``);
      lines.push(`  - Generated API tests: \`${target.artifacts.generatedApiTests}\``);
      lines.push(`  - Suggested rerun: \`${target.suggestedCommands[2]}\``);
    }
  }

  lines.push("", "### Safety", "");
  for (const note of plan.safety.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderProductFailuresMarkdown(report: {
  reportFound: boolean;
  reportPath: string;
  failures: ProductFailureBundle[];
  error?: string | undefined;
}): string {
  const lines = [
    "## CodeDecay MCP Product Failures",
    "",
    `**Latest report path:** \`${report.reportPath}\``,
    `**Report found:** ${report.reportFound ? "yes" : "no"}`,
    `**Failures:** ${report.failures.length}`,
    ""
  ];

  if (report.error) {
    lines.push(`Error: ${report.error}`, "");
  }

  appendProductFailureBundleMarkdown(lines, report.failures);
  return `${lines.join("\n")}\n`;
}

function renderMcpProductRunReport(report: McpProductRunReport, format: "markdown" | "json"): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay MCP Product Run",
    "",
    `**Executed:** ${report.executed ? "yes" : "no"}`,
    `**Latest report path:** \`${report.reportPath}\``,
    `**Command:** \`${report.command.join(" ")}\``,
    `**Failures:** ${report.failures.length}`,
    ""
  ];

  if (report.exitCode !== undefined) {
    lines.push(`**Exit code:** ${report.exitCode}`, "");
  }

  if (report.error) {
    lines.push(`**Error:** ${report.error}`, "");
  }

  appendProductFailureBundleMarkdown(lines, report.failures);

  lines.push("### Safety", "");
  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }

  if (!report.executed) {
    lines.push("- No product command was run because confirmExecution was not true or the CLI could not be resolved.");
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function appendProductFailureBundleMarkdown(lines: string[], failures: ProductFailureBundle[]): void {
  if (failures.length === 0) {
    lines.push("No product failures found.", "");
    return;
  }

  lines.push("### Failures", "");
  for (const failure of failures) {
    lines.push(`- ${formatPriority(failure.priority)} **${failure.title}** (\`${failure.checkId}\`, ${failure.checkKind})`);
    lines.push(`  - Target: \`${failure.target.id}\`${failure.target.baseUrl ? ` at \`${failure.target.baseUrl}\`` : ""}`);
    lines.push(
      `  - Classification: ${failure.classification}${failure.classificationConfidence !== undefined ? ` (${Math.round(failure.classificationConfidence * 100)}% confidence)` : ""}`
    );
    for (const evidence of failure.classificationEvidence ?? []) {
      lines.push(`  - Evidence: ${evidence}`);
    }
    lines.push(`  - Expected: ${failure.expected}`);
    lines.push(`  - Actual: ${failure.actual}`);
    for (const task of failure.suggestedFixTasks) {
      lines.push(`  - Repair task: ${task}`);
    }
    lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
  }
  lines.push("");
}

function formatPriority(priority: ProductFailureBundle["priority"]): string {
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
}
