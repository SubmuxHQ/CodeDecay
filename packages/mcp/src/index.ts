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
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION, createAnalysisReport, type CodeDecayReport, type ImpactedArea } from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import { applyMemoryContext, loadCodeDecayMemory, type LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, type RedteamReport } from "@submuxhq/codedecay-redteam";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createConfiguredToolHarnesses, type ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export interface StartMcpServerOptions {
  cwd: string;
}

export interface McpToolInput {
  cwd?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
}

export interface AnalyzePrToolInput extends McpToolInput {
  format?: "markdown" | "json" | undefined;
}

export interface ExecuteConfiguredChecksToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  confirmExecution?: boolean | undefined;
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

const WEAK_TEST_RULES = new Set([
  "test-without-assertions",
  "snapshot-only-test",
  "mocked-changed-source",
  "unrelated-test-change",
  "copied-implementation-in-test",
  "happy-path-only-test",
  "heavy-mocking",
  "test-bloat"
]);

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
    "Return changed files and likely impacted product/system areas for the PR.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runImpactMapTool(options, input))
  );

  server.tool(
    "audit_tests",
    "Return weak-test findings such as no assertions, snapshot-only tests, mocked changed source, unrelated tests, and copied implementation logic.",
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
      impactedAreas: report.impactedAreas
    },
    null,
    2
  );
}

export function runAuditTestsTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  const findings = report.findings.filter((finding) => WEAK_TEST_RULES.has(finding.ruleId));
  return JSON.stringify(
    {
      findings,
      recommendedChecks: report.recommendedTests.filter((check) => isTestAuditRecommendation(check))
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
      edgeCases: suggestEdgeCases(report.impactedAreas)
    },
    null,
    2
  );
}

export function runRedteamReportTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const context = createAnalysisContext(serverOptions, input);
  const report: RedteamReport = createRedteamReport({
    analysisReport: context.report,
    config: context.loadedConfig.config,
    configSource: context.loadedConfig.sourcePath,
    memory: context.loadedMemory.memory,
    memorySource: context.loadedMemory.sourcePath,
    skills: loadCodeDecaySkills({ cwd: context.rootDir })
  });

  return renderRedteamReport(report, input.format ?? "markdown");
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

function createReport(serverOptions: StartMcpServerOptions, input: McpToolInput): CodeDecayReport {
  return createAnalysisContext(serverOptions, input).report;
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
      analyzerResult: analyzerResultWithMemory
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

function formatEvidenceSeverity(severity: Evidence["severity"]): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}

function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

function suggestEdgeCases(areas: ImpactedArea[]): string[] {
  const suggestions = new Set<string>();

  for (const area of areas) {
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

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}

function isTestAuditRecommendation(check: string): boolean {
  return /assertion|snapshot|integration|real-module|public API|negative|edge-case|exercise/i.test(check);
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
