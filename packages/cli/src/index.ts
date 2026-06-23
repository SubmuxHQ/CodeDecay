import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConfiguredCommandAdapters,
  runAdapters,
  type AdapterResult,
  type AdapterStatus,
  type ConfiguredCommandKind
} from "@submuxhq/codedecay-adapters";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  CODEDECAY_VERSION,
  createAnalysisReport,
  riskLevelFromScore,
  shouldFailForRisk,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import { createGitWorktree, getGitChangedFiles, getRepoRoot, removeGitWorktree } from "@submuxhq/codedecay-git";
import { applyMemoryContext, loadCodeDecayMemory, type LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { renderReport, type ReportFormat } from "@submuxhq/codedecay-report";

interface AnalyzeOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ReportFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

interface ConfigOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
}

interface McpOptions {
  cwd?: string | undefined;
}

interface MemoryOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
}

interface ExecuteOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

interface DifferentialOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

interface ExecutionReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  configSource?: string | undefined;
  summary: ExecutionSummary;
  results: ExecutionResult[];
}

interface ExecutionSummary {
  status: AdapterStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  errors: number;
  durationMs: number;
}

interface ExecutionResult extends AdapterResult {
  kind: ConfiguredCommandKind;
  command: string;
}

type DifferentialStatus = "passed" | "changed" | "skipped" | "failed";

interface DifferentialReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  base: string;
  head: string;
  configSource?: string | undefined;
  summary: DifferentialSummary;
  results: DifferentialProbeResult[];
}

interface DifferentialSummary {
  status: DifferentialStatus;
  total: number;
  unchanged: number;
  changed: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

interface DifferentialProbeResult {
  id: string;
  name: string;
  command: string;
  status: DifferentialStatus;
  differences: string[];
  base: DifferentialSideResult;
  head: DifferentialSideResult;
}

interface DifferentialSideResult {
  status: AdapterStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  structuredOutput?: unknown;
}

interface CliRuntime {
  cwd?: string | undefined;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

type ConfigFormat = "json" | "markdown";

const VALID_FORMATS = new Set<ReportFormat>(["json", "markdown", "sarif"]);
const VALID_CONFIG_FORMATS = new Set<ConfigFormat>(["json", "markdown"]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);

class CliExit extends Error {
  constructor(readonly exitCode: number) {
    super(`Exit ${exitCode}`);
  }
}

class HelpRequested extends Error {}

if (isDirectRun()) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export async function runCli(args: string[], runtime: CliRuntime = {}): Promise<number> {
  try {
    await run(args, runtime);
    return 0;
  } catch (error: unknown) {
    if (error instanceof CliExit) {
      return error.exitCode;
    }

    if (error instanceof HelpRequested) {
      printHelp(runtime);
      return 0;
    }

    const message = error instanceof Error ? error.message : String(error);
    writeStderr(runtime, `CodeDecay failed: ${message}\n`);
    return 2;
  }
}

async function run(args: string[], runtime: CliRuntime): Promise<void | number> {
  const [command, ...commandArgs] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp(runtime);
    return;
  }

  const runtimeCwd = runtime.cwd ?? process.cwd();

  if (command === "config") {
    const options = parseConfigArgs(commandArgs);
    const cwd = resolve(runtimeCwd, options.cwd ?? ".");
    const loadedConfig = loadCodeDecayConfig({ cwd });
    write(runtime.stdout, renderConfig(loadedConfig, options.format));
    return;
  }

  if (command === "mcp") {
    const options = parseMcpArgs(commandArgs);
    const cwd = resolve(runtimeCwd, options.cwd ?? ".");
    const { startMcpServer } = await import("@submuxhq/codedecay-mcp");
    await startMcpServer({ cwd });
    return;
  }

  if (command === "memory") {
    const options = parseMemoryArgs(commandArgs);
    const cwd = resolve(runtimeCwd, options.cwd ?? ".");
    const rootDir = getRepoRootForCli(cwd, { format: "markdown" });
    const loadedMemory = loadCodeDecayMemory(rootDir);
    write(runtime.stdout, renderMemory(loadedMemory, options.format));
    return;
  }

  if (command === "execute") {
    const options = parseExecuteArgs(commandArgs);
    const cwd = resolve(runtimeCwd, options.cwd ?? ".");
    const loadedConfig = loadCodeDecayConfig({ cwd });
    const report = await createExecutionReport(cwd, loadedConfig);
    const rendered = renderExecutionReport(report, options.format);

    if (options.output) {
      writeOutput(cwd, options.output, rendered);
    } else {
      write(runtime.stdout, rendered);
    }

    if (isExecutionFailure(report.summary.status)) {
      throw new CliExit(1);
    }

    return;
  }

  if (command === "differential") {
    const options = parseDifferentialArgs(commandArgs);
    const cwd = resolve(runtimeCwd, options.cwd ?? ".");
    const refs = requireDifferentialRefs(options);
    const rootDir = getRepoRootForCli(cwd, { base: refs.base, head: refs.head, format: "markdown" });
    const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
    let report: DifferentialReport;

    try {
      report = await createDifferentialReport(rootDir, refs, loadedConfig);
    } catch (error: unknown) {
      throw formatGitErrorForCli(error, rootDir, { base: refs.base, head: refs.head, format: "markdown" });
    }

    const rendered = renderDifferentialReport(report, options.format);
    if (options.output) {
      writeOutput(cwd, options.output, rendered);
    } else {
      write(runtime.stdout, rendered);
    }

    if (isDifferentialFailure(report.summary.status)) {
      throw new CliExit(1);
    }

    return;
  }

  if (command !== "analyze") {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseAnalyzeArgs(commandArgs);
  const cwd = resolve(runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, options);
  const changedFiles = getChangedFilesForCli(rootDir, options);

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

  const report = createAnalysisReport({
    base: options.base,
    head: options.head,
    changedFiles,
    analyzerResult: analyzerResultWithMemory
  });

  const rendered = renderReport(report, options.format);
  if (options.output) {
    writeOutput(cwd, options.output, rendered);
  } else {
    write(runtime.stdout, rendered);
  }

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}

function parseConfigArgs(args: string[]): ConfigOptions {
  const options: ConfigOptions = {
    format: "json"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseMcpArgs(args: string[]): McpOptions {
  const options: McpOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseMemoryArgs(args: string[]): MemoryOptions {
  const options: MemoryOptions = {
    format: "json"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseExecuteArgs(args: string[]): ExecuteOptions {
  const options: ExecuteOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseDifferentialArgs(args: string[]): DifferentialOptions {
  const options: DifferentialOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseAnalyzeArgs(args: string[]): AnalyzeOptions {
  const options: AnalyzeOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--fail-on=")) {
      options.failOn = parseRiskLevel(arg.slice("--fail-on=".length));
      continue;
    }

    if (arg === "--fail-on") {
      options.failOn = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseFormat(value: string): ReportFormat {
  if (VALID_FORMATS.has(value as ReportFormat)) {
    return value as ReportFormat;
  }

  throw new Error(`Invalid format "${value}". Expected json, markdown, or sarif.`);
}

function parseConfigFormat(value: string): ConfigFormat {
  if (VALID_CONFIG_FORMATS.has(value as ConfigFormat)) {
    return value as ConfigFormat;
  }

  throw new Error(`Invalid config format "${value}". Expected json or markdown.`);
}

function parseRiskLevel(value: string): RiskLevel {
  if (VALID_RISK_LEVELS.has(value as RiskLevel)) {
    return value as RiskLevel;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return riskLevelFromScore(numeric);
  }

  throw new Error(`Invalid risk level "${value}". Expected low, medium, or high.`);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}

function renderConfig(loadedConfig: LoadedCodeDecayConfig, format: ConfigFormat): string {
  if (format === "markdown") {
    return renderConfigMarkdown(loadedConfig);
  }

  return `${JSON.stringify(loadedConfig, null, 2)}\n`;
}

function renderMemory(loadedMemory: LoadedCodeDecayMemory, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(loadedMemory, null, 2)}\n`;
  }

  const { memory, sourcePath } = loadedMemory;
  const lines = [
    "## CodeDecay Memory",
    "",
    `**Source:** ${sourcePath ? `\`${sourcePath}\`` : "defaults (no memory file found)"}`,
    "",
    "| Section | Count |",
    "| --- | ---: |",
    `| Flows | ${memory.flows.length} |`,
    `| Commands | ${memory.commands.length} |`,
    `| Invariants | ${memory.invariants.length} |`,
    `| Architecture notes | ${memory.architecture.length} |`,
    `| Past regressions | ${memory.regressions.length} |`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function createExecutionReport(rootDir: string, loadedConfig: LoadedCodeDecayConfig): Promise<ExecutionReport> {
  const startedAt = Date.now();
  const configuredAdapters = createConfiguredCommandAdapters(loadedConfig.config);
  const adapterResults: ExecutionResult[] = [];

  for (const configured of configuredAdapters) {
    const [result] = await runAdapters([configured.adapter], {
      rootDir,
      changedFiles: [],
      config: loadedConfig.config
    });

    if (!result) {
      continue;
    }

    adapterResults.push({
      ...result,
      kind: configured.kind,
      command: configured.command
    });
  }

  const report: ExecutionReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: createExecutionSummary(adapterResults, elapsed(startedAt)),
    results: adapterResults
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  return report;
}

function createExecutionSummary(results: ExecutionResult[], durationMs: number): ExecutionSummary {
  const passed = countStatus(results, "passed");
  const failed = countStatus(results, "failed");
  const skipped = countStatus(results, "skipped");
  const timedOut = countStatus(results, "timed_out");
  const errors = countStatus(results, "error");

  return {
    status: executionStatus(results, { failed, timedOut, errors }),
    total: results.length,
    passed,
    failed,
    skipped,
    timedOut,
    errors,
    durationMs
  };
}

function executionStatus(
  results: ExecutionResult[],
  counts: Pick<ExecutionSummary, "failed" | "timedOut" | "errors">
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

function renderExecutionReport(report: ExecutionReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderExecutionMarkdown(report);
}

function renderExecutionMarkdown(report: ExecutionReport): string {
  const lines = [
    "## CodeDecay Execution Report",
    "",
    `**Overall status:** ${formatStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
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

  if (report.results.length === 0) {
    lines.push("No configured commands or probes found.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Results", "");
  for (const result of report.results) {
    lines.push(
      `- **${result.name}** (${result.kind}) ${formatStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
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

  lines.push(
    "",
    "### Notes",
    "",
    "CodeDecay only runs commands explicitly configured in CodeDecay config. It does not run commands proposed by LLMs or remote services.",
    ""
  );

  return `${lines.join("\n")}\n`;
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

function countStatus(results: ExecutionResult[], status: AdapterStatus): number {
  return results.filter((result) => result.status === status).length;
}

function isExecutionFailure(status: AdapterStatus): boolean {
  return status === "failed" || status === "timed_out" || status === "error";
}

function formatStatus(status: AdapterStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function requireDifferentialRefs(options: DifferentialOptions): { base: string; head: string } {
  if (!options.base || !options.head) {
    throw new Error("codedecay differential requires --base <ref> and --head <ref>.");
  }

  return {
    base: options.base,
    head: options.head
  };
}

async function createDifferentialReport(
  rootDir: string,
  refs: { base: string; head: string },
  loadedConfig: LoadedCodeDecayConfig
): Promise<DifferentialReport> {
  const startedAt = Date.now();
  const configuredProbes = createConfiguredCommandAdapters(loadedConfig.config).filter((item) => item.kind === "probe");
  let baseWorktree: { path: string } | undefined;
  let headWorktree: { path: string } | undefined;

  try {
    baseWorktree = createGitWorktree({ cwd: rootDir, ref: refs.base, prefix: "base" });
    headWorktree = createGitWorktree({ cwd: rootDir, ref: refs.head, prefix: "head" });

    const results: DifferentialProbeResult[] = [];
    for (const probe of configuredProbes) {
      const baseResult = await runDifferentialSide(probe.adapter, baseWorktree.path, loadedConfig);
      const headResult = await runDifferentialSide(probe.adapter, headWorktree.path, loadedConfig);
      const differences = compareDifferentialSides(baseResult, headResult);
      const status = differentialProbeStatus(baseResult, headResult, differences);

      results.push({
        id: probe.adapter.id,
        name: probe.adapter.name,
        command: probe.command,
        status,
        differences,
        base: baseResult,
        head: headResult
      });
    }

    const report: DifferentialReport = {
      tool: "CodeDecay",
      version: CODEDECAY_VERSION,
      generatedAt: new Date().toISOString(),
      base: refs.base,
      head: refs.head,
      summary: createDifferentialSummary(results, elapsed(startedAt)),
      results
    };

    if (loadedConfig.sourcePath) {
      report.configSource = loadedConfig.sourcePath;
    }

    return report;
  } finally {
    if (headWorktree) {
      removeGitWorktree({ cwd: rootDir, path: headWorktree.path });
    }

    if (baseWorktree) {
      removeGitWorktree({ cwd: rootDir, path: baseWorktree.path });
    }
  }
}

async function runDifferentialSide(
  adapter: ReturnType<typeof createConfiguredCommandAdapters>[number]["adapter"],
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<DifferentialSideResult> {
  const [result] = await runAdapters([adapter], {
    rootDir,
    changedFiles: [],
    config: loadedConfig.config
  });

  if (!result) {
    return {
      status: "error",
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "Adapter did not return a result."
    };
  }

  return toDifferentialSide(result);
}

function toDifferentialSide(result: AdapterResult): DifferentialSideResult {
  const side: DifferentialSideResult = {
    status: result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr
  };

  if (result.exitCode !== undefined) {
    side.exitCode = result.exitCode;
  }

  if (result.error) {
    side.error = result.error;
  }

  const structuredOutput = parseStructuredOutput(result.stdout);
  if (structuredOutput !== undefined) {
    side.structuredOutput = structuredOutput;
  }

  return side;
}

function createDifferentialSummary(results: DifferentialProbeResult[], durationMs: number): DifferentialSummary {
  const changed = results.filter((result) => result.status === "changed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const unchanged = results.filter((result) => result.status === "passed").length;

  return {
    status: differentialStatus(results, { changed, failed, skipped }),
    total: results.length,
    unchanged,
    changed,
    skipped,
    failed,
    durationMs
  };
}

function differentialStatus(
  results: DifferentialProbeResult[],
  counts: Pick<DifferentialSummary, "changed" | "failed" | "skipped">
): DifferentialStatus {
  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.changed > 0) {
    return "changed";
  }

  if (results.length === 0 || counts.skipped === results.length) {
    return "skipped";
  }

  return "passed";
}

function differentialProbeStatus(
  base: DifferentialSideResult,
  head: DifferentialSideResult,
  differences: string[]
): DifferentialStatus {
  if (isDifferentialSideInfrastructureFailure(base) || isDifferentialSideInfrastructureFailure(head)) {
    return "failed";
  }

  if (base.status === "skipped" && head.status === "skipped") {
    return "skipped";
  }

  return differences.length > 0 ? "changed" : "passed";
}

function isDifferentialSideInfrastructureFailure(side: DifferentialSideResult): boolean {
  return side.status === "error" || side.status === "timed_out";
}

function compareDifferentialSides(base: DifferentialSideResult, head: DifferentialSideResult): string[] {
  const differences: string[] = [];

  if (base.status !== head.status) {
    differences.push(`status changed from ${base.status} to ${head.status}`);
  }

  if (base.exitCode !== head.exitCode) {
    differences.push(`exit code changed from ${formatOptionalNumber(base.exitCode)} to ${formatOptionalNumber(head.exitCode)}`);
  }

  if (base.structuredOutput !== undefined || head.structuredOutput !== undefined) {
    if (stableJson(base.structuredOutput) !== stableJson(head.structuredOutput)) {
      differences.push("structured stdout changed");
    }
  } else if (normalizeOutput(base.stdout) !== normalizeOutput(head.stdout)) {
    differences.push("stdout changed");
  }

  if (normalizeOutput(base.stderr) !== normalizeOutput(head.stderr)) {
    differences.push("stderr changed");
  }

  return differences;
}

function renderDifferentialReport(report: DifferentialReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderDifferentialMarkdown(report);
}

function renderDifferentialMarkdown(report: DifferentialReport): string {
  const lines = [
    "## CodeDecay Differential Report",
    "",
    `**Overall status:** ${formatDifferentialStatus(report.summary.status)}`,
    `**Base:** \`${report.base}\``,
    `**Head:** \`${report.head}\``,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Unchanged | ${report.summary.unchanged} |`,
    `| Changed | ${report.summary.changed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.results.length === 0) {
    lines.push("No configured probes found.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Probe Results", "");
  for (const result of report.results) {
    lines.push(`- **${result.name}** ${formatDifferentialStatus(result.status)}: \`${result.command}\``);

    if (result.differences.length > 0) {
      lines.push(`  - Differences: ${result.differences.join("; ")}`);
    }

    lines.push(`  - Base: ${formatStatus(result.base.status)}${formatSideExitCode(result.base)}`);
    lines.push(`  - Head: ${formatStatus(result.head.status)}${formatSideExitCode(result.head)}`);

    if (result.status === "changed" || result.status === "failed") {
      appendOutputBlock(lines, "base stdout", result.base.stdout);
      appendOutputBlock(lines, "head stdout", result.head.stdout);
      appendOutputBlock(lines, "base stderr", result.base.stderr);
      appendOutputBlock(lines, "head stderr", result.head.stderr);
    }
  }

  lines.push(
    "",
    "### Notes",
    "",
    "CodeDecay runs only configured probes from CodeDecay config on temporary git worktrees, then removes those worktrees.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function parseStructuredOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)])
    );
  }

  return value;
}

function normalizeOutput(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "none" : String(value);
}

function formatSideExitCode(side: DifferentialSideResult): string {
  return side.exitCode === undefined ? "" : `, exit ${side.exitCode}`;
}

function isDifferentialFailure(status: DifferentialStatus): boolean {
  return status === "changed" || status === "failed";
}

function formatDifferentialStatus(status: DifferentialStatus): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function renderConfigMarkdown(loadedConfig: LoadedCodeDecayConfig): string {
  const { config, sourcePath } = loadedConfig;
  const lines = [
    "## CodeDecay Config",
    "",
    `**Source:** ${sourcePath ? `\`${sourcePath}\`` : "defaults (no config file found)"}`,
    "",
    "### Safety",
    "",
    "| Setting | Value |",
    "| --- | ---: |",
    `| Command timeout | ${config.safety.commandTimeoutMs}ms |`,
    `| Allow configured commands | ${config.safety.allowCommands ? "yes" : "no"} |`,
    "",
    "### Commands",
    "",
    "| Type | Commands |",
    "| --- | --- |",
    `| Test | ${formatCommandList(config.commands.test)} |`,
    `| Build | ${formatCommandList(config.commands.build)} |`,
    `| Start | ${formatCommandList(config.commands.start)} |`,
    "",
    "### LLM",
    "",
    "| Setting | Value |",
    "| --- | --- |",
    `| Provider | ${config.llm.provider} |`,
    `| Model | ${config.llm.model ? `\`${config.llm.model}\`` : "none"} |`,
    `| Endpoint | ${config.llm.endpoint ? `\`${config.llm.endpoint}\`` : "none"} |`,
    `| Timeout | ${config.llm.timeoutMs}ms |`,
    "",
    "### Probes",
    ""
  ];

  if (config.probes.length === 0) {
    lines.push("No probes configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Name | Command | Timeout |", "| --- | --- | ---: |");
  for (const probe of config.probes) {
    lines.push(
      `| ${probe.name} | \`${probe.command}\` | ${probe.timeoutMs ? `${probe.timeoutMs}ms` : "default"} |`
    );
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function formatCommandList(commands: string[]): string {
  if (commands.length === 0) {
    return "none";
  }

  return commands.map((command) => `\`${command}\``).join("<br>");
}

function getRepoRootForCli(cwd: string, options: AnalyzeOptions): string {
  try {
    return getRepoRoot(cwd);
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, cwd, options);
  }
}

function getChangedFilesForCli(rootDir: string, options: AnalyzeOptions) {
  try {
    return getGitChangedFiles({
      cwd: rootDir,
      base: options.base,
      head: options.head
    });
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, rootDir, options);
  }
}

function formatGitErrorForCli(error: unknown, cwd: string, options: AnalyzeOptions): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("rev-parse --show-toplevel") && message.includes("not a git repository")) {
    return new Error(`${cwd} is not a git repository. Run from a git repo or pass --cwd <repo>.`);
  }

  const unresolvedRef = findUnresolvedRef(message, options);
  if (unresolvedRef) {
    return new Error(
      `Could not resolve git ref "${unresolvedRef}". Check --base/--head and fetch the ref before running CodeDecay.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function findUnresolvedRef(message: string, options: AnalyzeOptions): string | undefined {
  for (const ref of [options.base, options.head]) {
    if (ref && message.includes(ref)) {
      return ref;
    }
  }

  return undefined;
}

function printHelp(runtime: CliRuntime): void {
  writeStdout(runtime, `CodeDecay

Usage:
  codedecay analyze [options]
  codedecay config [options]
  codedecay memory [options]
  codedecay execute [options]
  codedecay differential [options]
  codedecay mcp [options]

Options:
  --base <ref>               Base git ref to compare from
  --head <ref>               Head git ref to compare to
  --cwd <path>               Repository working directory (default: current directory)
  --format <format>          json, markdown, or sarif (default: markdown)
  --output <path>            Write report to a file instead of stdout
  --fail-on <level>          Exit non-zero on low, medium, or high risk
  -h, --help                 Show help

Config Options:
  --cwd <path>               Repository working directory (default: current directory)
  --format <format>          json or markdown (default: json)

Memory Options:
  --cwd <path>               Repository working directory (default: current directory)
  --format <format>          json or markdown (default: json)

Execution Options:
  --cwd <path>               Repository working directory (default: current directory)
  --format <format>          json or markdown (default: markdown)
  --output <path>            Write execution report to a file instead of stdout

Differential Options:
  --base <ref>               Base git ref to compare from (required)
  --head <ref>               Head git ref to compare to (required)
  --cwd <path>               Repository working directory (default: current directory)
  --format <format>          json or markdown (default: markdown)
  --output <path>            Write differential report to a file instead of stdout

MCP Options:
  --cwd <path>               Repository working directory exposed to MCP tools

Examples:
  codedecay analyze --base main --head HEAD --format markdown
  codedecay analyze --cwd ../my-repo --format json
  codedecay analyze --format sarif --output codedecay.sarif
  codedecay analyze --fail-on high
  codedecay config --cwd ../my-repo --format markdown
  codedecay memory --cwd ../my-repo --format markdown
  codedecay execute --cwd ../my-repo --format markdown
  codedecay differential --base main --head HEAD --format markdown
  codedecay mcp --cwd ../my-repo
`);
}

function write(writer: ((text: string) => void) | undefined, text: string): void {
  if (writer) {
    writer(text);
    return;
  }

  process.stdout.write(text);
}

function writeStdout(runtime: CliRuntime, text: string): void {
  write(runtime.stdout, text);
}

function writeStderr(runtime: CliRuntime, text: string): void {
  if (runtime.stderr) {
    runtime.stderr(text);
    return;
  }

  process.stderr.write(text);
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && realPathOrResolve(entrypoint) === realPathOrResolve(fileURLToPath(import.meta.url)));
}

function realPathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
