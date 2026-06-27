import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createConfiguredCommandAdapters,
  runAdapters,
  type AdapterResult,
  type AdapterStatus,
  type ConfiguredCommandKind
} from "@submuxhq/codedecay-adapters";
import {
  AGENT_PROFILE_IDS,
  createAgentTaskBundle,
  renderAgentTaskBundle,
  type AgentProfileId
} from "@submuxhq/codedecay-agent";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  CODEDECAY_VERSION,
  createAnalysisReport,
  productFailureBundlesFromProductTargetReport,
  type CodeDecayReport,
  type ImpactedArea,
  type ProductCheckKind,
  type ProductFailureBundle
} from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import { applyMemoryContext, loadCodeDecayMemory, type LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, type RedteamReport } from "@submuxhq/codedecay-redteam";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { createConfiguredToolHarnesses, type ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export interface StartMcpServerOptions {
  cwd: string;
  cliPath?: string | undefined;
}

export interface McpToolInput {
  cwd?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
}

export interface AnalyzePrToolInput extends McpToolInput {
  format?: "markdown" | "json" | undefined;
}

export interface AgentTaskBundleToolInput extends AnalyzePrToolInput {
  profile?: AgentProfileId | undefined;
}

export interface ExecuteConfiguredChecksToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  confirmExecution?: boolean | undefined;
}

export interface ProductToolInput {
  cwd?: string | undefined;
  target?: string | undefined;
  format?: "markdown" | "json" | undefined;
}

export interface ProductRunToolInput extends ProductToolInput {
  confirmExecution?: boolean | undefined;
  explore?: boolean | undefined;
  generateTests?: boolean | undefined;
  runGeneratedTests?: boolean | undefined;
  generateApiTests?: boolean | undefined;
  runGeneratedApiTests?: boolean | undefined;
  allowDestructiveActions?: boolean | undefined;
  maxPages?: number | undefined;
  maxActions?: number | undefined;
  testId?: string | undefined;
}

export interface ProductRerunToolInput extends ProductToolInput {
  confirmExecution?: boolean | undefined;
  testId?: string | undefined;
  checkKind?: ProductCheckKind | undefined;
}

interface McpAnalysisContext {
  rootDir: string;
  loadedConfig: LoadedCodeDecayConfig;
  loadedMemory: LoadedCodeDecayMemory;
  report: CodeDecayReport;
}

interface McpExecutionReport {
  tool: "CodeDecay";
  version: string;
  mode: "mcp-execute";
  generatedAt: string;
  executed: boolean;
  configSource?: string | undefined;
  summary: McpExecutionSummary;
  results: McpExecutionResult[];
  toolAdapters: McpExecutionToolAdapterResult[];
  safety: McpExecutionSafety;
}

interface McpExecutionSummary {
  status: AdapterStatus | "not_confirmed";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  errors: number;
  durationMs: number;
}

interface McpExecutionResult extends AdapterResult {
  kind: ConfiguredCommandKind;
  command: string;
}

interface McpExecutionToolAdapterResult {
  kind: ConfiguredToolAdapterKind;
  name: string;
  command: string;
  status: AdapterStatus;
  durationMs: number;
  summary: string;
  evidence: Evidence[];
  timeoutMs?: number | undefined;
  failure?: HarnessFailure | undefined;
}

interface McpExecutionSafety {
  confirmExecutionRequired: true;
  confirmExecution: boolean;
  allowCommands: boolean;
  notes: string[];
}

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

export async function startMcpServer(options: StartMcpServerOptions): Promise<void> {
  const server = createCodeDecayMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createCodeDecayMcpServer(options: StartMcpServerOptions): McpServer {
  const server = new McpServer({
    name: "codedecay",
    version: CODEDECAY_VERSION
  });

  server.tool(
    "analyze_pr",
    "Analyze a pull request or working tree for regression risk and maintainability decay.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format.")
    },
    async (input) => textResult(runAnalyzePrTool(options, input))
  );

  server.tool(
    "impact_map",
    "Return changed files, likely impacted product/system areas, and concrete route/API impacts for the PR.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runImpactMapTool(options, input))
  );

  server.tool(
    "audit_tests",
    "Return missing-test and weak-test proof findings such as no changed tests, no assertions, snapshot-only tests, mocked changed source, unrelated tests, and copied implementation logic.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runAuditTestsTool(options, input))
  );

  server.tool(
    "suggest_edge_cases",
    "Return deterministic edge-case and real-check suggestions for impacted areas. This does not call an LLM.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runSuggestEdgeCasesTool(options, input))
  );

  server.tool(
    "redteam_report",
    "Return a deterministic CodeDecay redteam report for an MCP-compatible agent. Report-only: does not execute commands or call models.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format.")
    },
    async (input) => textResult(runRedteamReportTool(options, input))
  );

  server.tool(
    "agent_task_bundle",
    "Return a deterministic CodeDecay task bundle that user-owned coding agents can use to fix PR risks. Report-only: does not execute commands or call models.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format."),
      profile: z.enum(AGENT_PROFILE_IDS).optional().describe("User-owned agent handoff profile.")
    },
    async (input) => textResult(runAgentTaskBundleTool(options, input))
  );

  server.tool(
    "execute_configured_checks",
    "Run only explicitly configured CodeDecay commands and tool adapters. Requires confirmExecution=true and safety.allowCommands=true; never runs arbitrary MCP-provided commands.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format."),
      confirmExecution: z
        .boolean()
        .optional()
        .describe("Must be true before CodeDecay runs configured local commands.")
    },
    async (input) => textResult(runExecuteConfiguredChecksTool(options, input))
  );

  server.tool(
    "codedecay_product_plan",
    "Plan configured product verification targets and artifact paths without running product commands.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      target: z.string().optional().describe("Optional productTesting target id."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format.")
    },
    async (input) => textResult(runProductPlanTool(options, input))
  );

  server.tool(
    "codedecay_product_run",
    "Run fixed CodeDecay product verification commands. Requires confirmExecution=true; never runs arbitrary MCP-provided commands.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      target: z.string().optional().describe("Optional productTesting target id."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format."),
      confirmExecution: z.boolean().optional().describe("Must be true before CodeDecay runs product verification."),
      explore: z.boolean().optional().describe("Run product flow exploration."),
      generateTests: z.boolean().optional().describe("Generate UI tests from the flow map."),
      runGeneratedTests: z.boolean().optional().describe("Run generated UI tests."),
      generateApiTests: z.boolean().optional().describe("Generate API tests from OpenAPI or configured endpoints."),
      runGeneratedApiTests: z.boolean().optional().describe("Run generated API tests."),
      allowDestructiveActions: z.boolean().optional().describe("Allow destructive product actions when generating/running checks."),
      maxPages: z.number().int().positive().optional().describe("Maximum pages for exploration."),
      maxActions: z.number().int().positive().optional().describe("Maximum interactive actions for exploration."),
      testId: z.string().optional().describe("Generated test id to rerun.")
    },
    async (input) => textResult(runProductRunTool(options, input))
  );

  server.tool(
    "codedecay_product_failures",
    "Return product verification failures from the latest local product run artifact.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      target: z.string().optional().describe("Optional productTesting target id."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format.")
    },
    async (input) => textResult(runProductFailuresTool(options, input))
  );

  server.tool(
    "codedecay_product_rerun",
    "Rerun one failed generated product check from the latest local product run artifact. Requires confirmExecution=true.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      target: z.string().optional().describe("Optional productTesting target id. Defaults to the failed target."),
      testId: z.string().optional().describe("Generated test id. Defaults to the first latest failure."),
      checkKind: z.enum(["ui", "api", "workflow"]).optional().describe("Failed check kind when testId is supplied manually."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format."),
      confirmExecution: z.boolean().optional().describe("Must be true before CodeDecay reruns product verification.")
    },
    async (input) => textResult(runProductRerunTool(options, input))
  );

  return server;
}

export function runAnalyzePrTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const report = createReport(serverOptions, input);
  if (input.format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderMarkdownReport(report);
}

export function runImpactMapTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      changedFiles: report.changedFiles,
      impactedAreas: report.impactedAreas,
      impactedRoutes: report.impactedRoutes ?? []
    },
    null,
    2
  );
}

export function runAuditTestsTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  const audit = createTestProofAudit(report);
  const findings = [...audit.missingTestFindings, ...audit.weakTestFindings];

  return JSON.stringify(
    {
      status: audit.status,
      summary: audit.summary,
      changedSourceFiles: audit.changedSourceFiles,
      changedTestFiles: audit.changedTestFiles,
      missingTestFindings: audit.missingTestFindings,
      weakTestFindings: audit.weakTestFindings,
      findings,
      recommendedChecks: audit.recommendedChecks
    },
    null,
    2
  );
}

export function runSuggestEdgeCasesTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      recommendedChecks: report.recommendedTests,
      edgeCases: suggestEdgeCases(report)
    },
    null,
    2
  );
}

export function runRedteamReportTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const context = createAnalysisContext(serverOptions, input);
  const report = createMcpRedteamReport(context);

  return renderRedteamReport(report, input.format ?? "markdown");
}

export function runAgentTaskBundleTool(serverOptions: StartMcpServerOptions, input: AgentTaskBundleToolInput): string {
  const context = createAnalysisContext(serverOptions, input);
  const report = createMcpRedteamReport(context);
  const bundle = createAgentTaskBundle(report, { profile: input.profile ?? "generic" });

  return renderAgentTaskBundle(bundle, input.format ?? "markdown");
}

export async function runExecuteConfiguredChecksTool(
  serverOptions: StartMcpServerOptions,
  input: ExecuteConfiguredChecksToolInput
): Promise<string> {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const report = await createMcpExecutionReport(rootDir, loadedConfig, Boolean(input.confirmExecution));

  return renderMcpExecutionReport(report, input.format ?? "markdown");
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

function createReport(serverOptions: StartMcpServerOptions, input: McpToolInput): CodeDecayReport {
  return createAnalysisContext(serverOptions, input).report;
}

function createMcpRedteamReport(context: McpAnalysisContext): RedteamReport {
  return createRedteamReport({
    analysisReport: context.report,
    config: context.loadedConfig.config,
    configSource: context.loadedConfig.sourcePath,
    memory: context.loadedMemory.memory,
    memorySource: context.loadedMemory.sourcePath,
    skills: loadCodeDecaySkills({ cwd: context.rootDir })
  });
}

function createAnalysisContext(serverOptions: StartMcpServerOptions, input: McpToolInput): McpAnalysisContext {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const changedFiles = getGitChangedFiles({
    cwd: rootDir,
    base: input.base,
    head: input.head
  });

  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const analyzerResultWithMemory = applyMemoryContext({
    memory: loadedMemory.memory,
    changedFiles,
    impactedAreas: analyzerResult.impactedAreas,
    analyzerResult
  });

  return {
    rootDir,
    loadedConfig,
    loadedMemory,
    report: createAnalysisReport({
      base: input.base,
      head: input.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory,
      productFailureBundles: loadLatestProductRun(rootDir).failures
    })
  };
}

async function createMcpExecutionReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  confirmExecution: boolean
): Promise<McpExecutionReport> {
  const startedAt = Date.now();
  const safety = createExecutionSafety(loadedConfig, confirmExecution);

  if (!confirmExecution) {
    const report = createBaseExecutionReport({
      loadedConfig,
      executed: false,
      safety,
      summary: {
        status: "not_confirmed",
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        timedOut: 0,
        errors: 0,
        durationMs: elapsed(startedAt)
      },
      results: [],
      toolAdapters: []
    });

    return report;
  }

  const results = await runConfiguredCommandChecks(rootDir, loadedConfig);
  const toolAdapters = await runConfiguredToolAdapterChecks(rootDir, loadedConfig);

  return createBaseExecutionReport({
    loadedConfig,
    executed: true,
    safety,
    summary: createExecutionSummary(results, toolAdapters, elapsed(startedAt)),
    results,
    toolAdapters
  });
}

function createBaseExecutionReport(input: {
  loadedConfig: LoadedCodeDecayConfig;
  executed: boolean;
  safety: McpExecutionSafety;
  summary: McpExecutionSummary;
  results: McpExecutionResult[];
  toolAdapters: McpExecutionToolAdapterResult[];
}): McpExecutionReport {
  const report: McpExecutionReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "mcp-execute",
    generatedAt: new Date().toISOString(),
    executed: input.executed,
    summary: input.summary,
    results: input.results,
    toolAdapters: input.toolAdapters,
    safety: input.safety
  };

  if (input.loadedConfig.sourcePath) {
    report.configSource = input.loadedConfig.sourcePath;
  }

  return report;
}

function createExecutionSafety(loadedConfig: LoadedCodeDecayConfig, confirmExecution: boolean): McpExecutionSafety {
  const notes = [
    "This MCP tool never runs arbitrary commands from MCP input.",
    "Only commands explicitly configured in CodeDecay config and enabled tool adapters are eligible to run.",
    "Command execution also requires safety.allowCommands: true in CodeDecay config."
  ];

  if (!confirmExecution) {
    notes.push("No commands were executed because confirmExecution was not true.");
  }

  if (!loadedConfig.config.safety.allowCommands) {
    notes.push("Configured commands will be skipped because safety.allowCommands is false.");
  }

  return {
    confirmExecutionRequired: true,
    confirmExecution,
    allowCommands: loadedConfig.config.safety.allowCommands,
    notes
  };
}

async function runConfiguredCommandChecks(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<McpExecutionResult[]> {
  const configuredAdapters = createConfiguredCommandAdapters(loadedConfig.config);
  const results: McpExecutionResult[] = [];

  for (const configured of configuredAdapters) {
    const [result] = await runAdapters([configured.adapter], {
      rootDir,
      changedFiles: [],
      config: loadedConfig.config
    });

    if (!result) {
      continue;
    }

    results.push({
      ...result,
      kind: configured.kind,
      command: configured.command
    });
  }

  return results;
}

async function runConfiguredToolAdapterChecks(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<McpExecutionToolAdapterResult[]> {
  const configuredToolAdapters = createConfiguredToolHarnesses(loadedConfig.config);
  const results: McpExecutionToolAdapterResult[] = [];

  for (const configured of configuredToolAdapters) {
    const plan = await configured.harness.plan({
      cwd: rootDir,
      evidence: []
    });
    const context = configured.timeoutMs === undefined ? { cwd: rootDir } : { cwd: rootDir, timeoutMs: configured.timeoutMs };
    const result = await configured.harness.run(plan, context);
    const mapped: McpExecutionToolAdapterResult = {
      kind: configured.kind,
      name: configured.name,
      command: configured.command,
      status: result.status,
      durationMs: result.durationMs,
      summary: result.summary ?? result.failure?.message ?? `${configured.name} produced ${result.evidence.length} evidence item(s).`,
      evidence: result.evidence
    };

    if (configured.timeoutMs !== undefined) {
      mapped.timeoutMs = configured.timeoutMs;
    }

    if (result.failure) {
      mapped.failure = result.failure;
    }

    results.push(mapped);
  }

  return results;
}

function createExecutionSummary(
  results: McpExecutionResult[],
  toolAdapters: McpExecutionToolAdapterResult[],
  durationMs: number
): McpExecutionSummary {
  const allResults = [...results, ...toolAdapters];
  const passed = countStatus(allResults, "passed");
  const failed = countStatus(allResults, "failed");
  const skipped = countStatus(allResults, "skipped");
  const timedOut = countStatus(allResults, "timed_out");
  const errors = countStatus(allResults, "error");

  return {
    status: executionStatus(allResults, { failed, timedOut, errors }),
    total: allResults.length,
    passed,
    failed,
    skipped,
    timedOut,
    errors,
    durationMs
  };
}

function executionStatus(
  results: Array<{ status: AdapterStatus }>,
  counts: Pick<McpExecutionSummary, "failed" | "timedOut" | "errors">
): AdapterStatus {
  if (counts.errors > 0) {
    return "error";
  }

  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function renderMcpExecutionReport(report: McpExecutionReport, format: "markdown" | "json"): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderMcpExecutionMarkdown(report);
}

function renderMcpExecutionMarkdown(report: McpExecutionReport): string {
  const lines = [
    "## CodeDecay MCP Execution Report",
    "",
    `**Executed:** ${report.executed ? "yes" : "no"}`,
    `**Overall status:** ${formatExecutionStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    `**Command execution allowed:** ${report.safety.allowCommands ? "yes" : "no"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Errors | ${report.summary.errors} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (!report.executed) {
    lines.push("No commands were executed. Pass `confirmExecution: true` to run configured local checks.", "");
  }

  if (report.results.length > 0) {
    lines.push("### Configured Command Results", "");
    for (const result of report.results) {
      lines.push(
        `- **${result.name}** (${result.kind}) ${formatExecutionStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
      );

      if (result.exitCode !== undefined) {
        lines.push(`  - Exit code: ${result.exitCode}`);
      }

      if (result.error) {
        lines.push(`  - Error: ${result.error}`);
      }

      appendOutputBlock(lines, "stdout", result.stdout);
      appendOutputBlock(lines, "stderr", result.stderr);
    }
    lines.push("");
  }

  if (report.toolAdapters.length > 0) {
    lines.push("### Tool Adapter Results", "");
    for (const result of report.toolAdapters) {
      lines.push(
        `- **${result.name}** (${result.kind}) ${formatExecutionStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
      );

      if (result.failure) {
        lines.push(`  - Failure: ${result.failure.mode}: ${result.failure.message}`);
      }

      appendToolEvidence(lines, result.evidence);
    }
    lines.push("");
  }

  if (report.results.length === 0 && report.toolAdapters.length === 0 && report.executed) {
    lines.push("No configured commands, probes, or tool adapters found.", "");
  }

  lines.push("### Safety", "");
  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
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

function loadLatestProductRun(rootDir: string): {
  report?: unknown | undefined;
  failures: ProductFailureBundle[];
  error?: string | undefined;
} {
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

function filterProductFailures(failures: ProductFailureBundle[], input: { target?: string | undefined }): ProductFailureBundle[] {
  return input.target ? failures.filter((failure) => failure.target.id === input.target) : failures;
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
    lines.push(`  - Classification: ${failure.classification}`);
    lines.push(`  - Expected: ${failure.expected}`);
    lines.push(`  - Actual: ${failure.actual}`);
    lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
  }
  lines.push("");
}

function appendToolEvidence(lines: string[], evidence: Evidence[]): void {
  if (evidence.length === 0) {
    return;
  }

  lines.push("  - Evidence:");
  for (const item of evidence.slice(0, 5)) {
    lines.push(`    - ${formatEvidenceSeverity(item.severity)} ${item.kind}: ${item.summary}`);
  }
}

function appendOutputBlock(lines: string[], label: string, output: string): void {
  const trimmed = output.trim();
  if (!trimmed) {
    return;
  }

  lines.push(`  - ${label}:`);
  lines.push("    ```text");
  for (const line of trimLongOutput(trimmed).split(/\r?\n/)) {
    lines.push(`    ${line}`);
  }
  lines.push("    ```");
}

function trimLongOutput(output: string): string {
  const limit = 2000;
  if (output.length <= limit) {
    return output;
  }

  return `${output.slice(output.length - limit)}\n[output truncated to last ${limit} characters]`;
}

function countStatus(results: Array<{ status: AdapterStatus }>, status: AdapterStatus): number {
  return results.filter((result) => result.status === status).length;
}

function formatExecutionStatus(status: AdapterStatus | "not_confirmed"): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  if (status === "not_confirmed") {
    return "Not confirmed";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatPriority(priority: ProductFailureBundle["priority"]): string {
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
}

function formatEvidenceSeverity(severity: Evidence["severity"]): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}

function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

function suggestEdgeCases(report: CodeDecayReport): string[] {
  const suggestions = new Set<string>();

  for (const area of report.impactedAreas) {
    if (area.kind === "api") {
      suggestions.add("Exercise the real API route with malformed, missing, and boundary-value payloads.");
      suggestions.add("Check auth, validation, and downstream consumers through the route, not only helper functions.");
    }

    if (area.kind === "auth") {
      suggestions.add("Check missing, expired, malformed, and privilege-escalation credentials.");
      suggestions.add("Verify denied paths fail closed and do not silently return privileged defaults.");
    }

    if (area.kind === "database") {
      suggestions.add("Check migration/schema compatibility with existing records and null/default values.");
      suggestions.add("Verify read and write paths that depend on changed schema fields.");
    }

    if (area.kind === "ui") {
      suggestions.add("Check loading, empty, error, and permission-denied UI states.");
      suggestions.add("Exercise the real route through browser or component integration tests.");
    }

    if (area.kind === "config") {
      suggestions.add("Run build/start commands in a clean environment to catch config or packaging regressions.");
      suggestions.add("Verify CI and production-like environment variables still resolve correctly.");
    }
  }

  for (const recommendation of report.recommendedTests) {
    suggestions.add(recommendation);
  }

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}

async function textResult(value: string | Promise<string>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return {
    content: [
      {
        type: "text",
        text: await value
      }
    ]
  };
}
