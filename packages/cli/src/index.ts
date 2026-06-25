import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  isAgentProfileId,
  renderAgentTaskBundle,
  type AgentProfileId,
  type AgentTaskBundleFormat
} from "@submuxhq/codedecay-agent";
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
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import { applyMemoryContext, loadCodeDecayMemory, type LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, type RedteamFormat } from "@submuxhq/codedecay-redteam";
import { renderReport, type ReportFormat } from "@submuxhq/codedecay-report";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createConfiguredToolHarnesses, type ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

interface AnalyzeOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ReportFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

interface AgentOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: AgentTaskBundleFormat;
  profile: AgentProfileId;
  output?: string | undefined;
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

interface RedteamOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: RedteamFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface UpdateOptions {
  cwd?: string | undefined;
  manager?: PackageManager | undefined;
  apply: boolean;
}

interface UninstallOptions {
  cwd?: string | undefined;
  manager?: PackageManager | undefined;
  apply: boolean;
  purgeLocal: boolean;
}

interface UpdatePlan {
  manager?: PackageManager | undefined;
  source: string;
  displayCommand: string;
  command: string;
  args: string[];
  canApply: boolean;
}

interface UninstallPlan {
  manager?: PackageManager | undefined;
  source: string;
  displayCommand?: string | undefined;
  command?: string | undefined;
  args: string[];
  canApplyPackage: boolean;
  dependencyLocation: "devDependencies" | "dependencies" | "optionalDependencies" | "none";
  dependencyVersion?: string | undefined;
  purgeTargets: string[];
}

interface ExecutionReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  configSource?: string | undefined;
  summary: ExecutionSummary;
  results: ExecutionResult[];
  toolAdapters: ExecutionToolAdapterResult[];
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

interface ExecutionToolAdapterResult {
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

interface CliCommandContext {
  args: string[];
  runtime: CliRuntime;
  runtimeCwd: string;
}

interface CliAnalysisContext {
  report: ReturnType<typeof createAnalysisReport>;
  loadedMemory: LoadedCodeDecayMemory;
}

interface HelpOptionDoc {
  flag: string;
  description: string;
}

interface CommandDoc {
  name: string;
  summary: string;
  usage: string[];
  description: string[];
  options: HelpOptionDoc[];
  examples: string[];
  notes?: string[];
}

type CliCommandHandler = (context: CliCommandContext) => Promise<void> | void;
type ConfigFormat = "json" | "markdown";

const VALID_FORMATS = new Set<ReportFormat>(["json", "markdown", "sarif"]);
const VALID_CONFIG_FORMATS = new Set<ConfigFormat>(["json", "markdown"]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);
const VALID_PACKAGE_MANAGERS = new Set<PackageManager>(["npm", "pnpm", "yarn", "bun"]);
const PACKAGE_NAME = "@submuxhq/codedecay";
const COMMAND_ORDER = ["analyze", "redteam", "agent", "config", "memory", "execute", "differential", "mcp"] as const;
const UTILITY_COMMAND_ORDER = ["help", "man", "update", "uninstall", "version"] as const;
const ROOT_FLAG_ALIASES = ["--help", "-h", "--version", "-V"] as const;
const CODEDECAY_PURGE_FILE_PATTERN = /^codedecay(?:[-_.][a-z0-9._-]+)?\.(?:json|md|sarif|txt)$/i;

class CliExit extends Error {
  constructor(readonly exitCode: number) {
    super(`Exit ${exitCode}`);
  }
}

class HelpRequested extends Error {}

const HELP_DOCS: Record<string, CommandDoc> = {
  analyze: {
    name: "analyze",
    summary: "Deterministic PR risk, impact, and decay report.",
    usage: ["codedecay analyze [options]"],
    description: [
      "Analyze the current working tree or a base/head git diff and report regression risk, blast radius, missing tests, and maintainability decay."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json, markdown, or sarif (default: markdown)" },
      { flag: "--output <path>", description: "Write report to a file instead of stdout" },
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk" }
    ],
    examples: [
      "codedecay analyze --format markdown",
      "codedecay analyze --base main --head HEAD --format json",
      "codedecay analyze --format sarif --output codedecay.sarif"
    ],
    notes: [
      "When --base/--head are omitted, CodeDecay analyzes the current git working tree.",
      "Relative --output paths resolve from the analyzed repository root."
    ]
  },
  redteam: {
    name: "redteam",
    summary: "Merge-safety report with impact, weak-test proof, edge cases, and fix tasks.",
    usage: ["codedecay redteam [options]"],
    description: [
      "Produce a deterministic red-team review bundle that packages likely breakage paths, missing tests, edge cases, config context, and local skill context."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write redteam report to a file instead of stdout" },
      { flag: "--fail-on <level>", description: "Exit non-zero on low, medium, or high risk" }
    ],
    examples: [
      "codedecay redteam --base main --head HEAD --format markdown",
      "codedecay redteam --cwd ../my-repo --format json"
    ],
    notes: [
      "Redteam reports do not execute configured commands or call LLMs by default.",
      "Configured checks are described in the report as recommendations unless you run execute or differential explicitly."
    ]
  },
  agent: {
    name: "agent",
    summary: "Task bundle for Codex, Claude Code, Cursor, Pi, OpenCode, desktop agents, or MCP clients.",
    usage: ["codedecay agent [options]"],
    description: [
      "Generate an agent-facing task bundle from the same deterministic analysis and red-team context used by CodeDecay."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--profile <profile>", description: `${AGENT_PROFILE_IDS.join(", ")} (default: generic)` },
      { flag: "--output <path>", description: "Write agent task bundle to a file instead of stdout" }
    ],
    examples: [
      "codedecay agent --profile codex --base main --head HEAD --format markdown",
      "codedecay agent --cwd ../my-repo --profile opencode --format json"
    ],
    notes: [
      "Agent bundles package evidence and instructions only. They do not trigger agent or model calls by themselves."
    ]
  },
  config: {
    name: "config",
    summary: "Show normalized CodeDecay config.",
    usage: ["codedecay config [options]"],
    description: [
      "Load repo-local CodeDecay config and render the normalized settings as JSON or markdown."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: json)" }
    ],
    examples: ["codedecay config --format markdown", "codedecay config --cwd ../my-repo --format json"]
  },
  memory: {
    name: "memory",
    summary: "Show local repo memory.",
    usage: ["codedecay memory [options]"],
    description: [
      "Load `.codedecay/memory.json` and render the normalized memory sections used by redteam and agent workflows."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: json)" }
    ],
    examples: ["codedecay memory --format markdown", "codedecay memory --cwd ../my-repo --format json"]
  },
  execute: {
    name: "execute",
    summary: "Run explicitly configured local checks and tool adapters.",
    usage: ["codedecay execute [options]"],
    description: [
      "Execute only the commands and tool adapters already declared in CodeDecay config, subject to the configured safety gates."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write execution report to a file instead of stdout" }
    ],
    examples: ["codedecay execute --format markdown", "codedecay execute --cwd ../my-repo --format json"],
    notes: [
      "If `safety.allowCommands` is false, configured commands and adapters are reported as skipped instead of executed."
    ]
  },
  differential: {
    name: "differential",
    summary: "Compare configured base/head behavior probes.",
    usage: ["codedecay differential [options]"],
    description: [
      "Run configured probes against temporary worktrees for base and head refs, then report behavioral differences."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from (required)" },
      { flag: "--head <ref>", description: "Head git ref to compare to (required)" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write differential report to a file instead of stdout" }
    ],
    examples: [
      "codedecay differential --base main --head HEAD --format markdown",
      "codedecay differential --cwd ../my-repo --base origin/main --head HEAD --format json"
    ],
    notes: [
      "Differential exits non-zero when probe behavior changes or infrastructure failures occur."
    ]
  },
  mcp: {
    name: "mcp",
    summary: "Start the local MCP server.",
    usage: ["codedecay mcp [options]"],
    description: [
      "Expose CodeDecay analysis capabilities through a local Model Context Protocol server for agent clients."
    ],
    options: [{ flag: "--cwd <path>", description: "Repository working directory exposed to MCP tools" }],
    examples: ["codedecay mcp --cwd ../my-repo"]
  },
  help: {
    name: "help",
    summary: "Show root or per-command help.",
    usage: ["codedecay help", "codedecay help <command>"],
    description: [
      "Print concise usage documentation for the whole CLI or for a specific command."
    ],
    options: [],
    examples: ["codedecay help", "codedecay help analyze"],
    notes: [
      "`codedecay <command> --help` prints the same command-specific help text."
    ]
  },
  man: {
    name: "man",
    summary: "Show a longer manual page.",
    usage: ["codedecay man", "codedecay man <command>"],
    description: [
      "Print a fuller manual view with command descriptions, options, examples, and operational notes."
    ],
    options: [],
    examples: ["codedecay man", "codedecay man redteam"]
  },
  update: {
    name: "update",
    summary: "Print or apply the recommended CLI upgrade command.",
    usage: ["codedecay update [options]"],
    description: [
      "Detect the repository package manager and print the safest upgrade command for `@submuxhq/codedecay`. By default this is a dry run."
    ],
    options: [
      { flag: "--cwd <path>", description: "Working directory used for package-manager detection" },
      { flag: "--manager <name>", description: "Override detection with npm, pnpm, yarn, or bun" },
      { flag: "--apply", description: "Execute the recommended upgrade command instead of only printing it" }
    ],
    examples: [
      "codedecay update",
      "codedecay update --cwd ../my-repo",
      "codedecay update --manager pnpm --apply"
    ],
    notes: [
      "Update never executes automatically. You must pass --apply to run the package-manager command."
    ]
  },
  uninstall: {
    name: "uninstall",
    summary: "Print or apply the recommended uninstall and cleanup plan.",
    usage: ["codedecay uninstall [options]"],
    description: [
      "Detect the repository package manager and print the safest removal command for `@submuxhq/codedecay`. Optionally purge repo-local CodeDecay state and generated artifacts."
    ],
    options: [
      { flag: "--cwd <path>", description: "Working directory used for package-manager detection" },
      { flag: "--manager <name>", description: "Override detection with npm, pnpm, yarn, or bun" },
      { flag: "--purge-local", description: "Also remove local `.codedecay/` state and detected CodeDecay report artifacts" },
      { flag: "--apply", description: "Execute the uninstall and optional purge instead of only printing the plan" }
    ],
    examples: [
      "codedecay uninstall",
      "codedecay uninstall --cwd ../my-repo --purge-local",
      "codedecay uninstall --manager pnpm --purge-local --apply"
    ],
    notes: [
      "Uninstall does not rewrite CI workflows, docs links, or other user-authored references automatically."
    ]
  },
  version: {
    name: "version",
    summary: "Print the installed CodeDecay version.",
    usage: ["codedecay version", "codedecay --version"],
    description: [
      "Print the CLI version bundled into the current CodeDecay build."
    ],
    options: [],
    examples: ["codedecay version", "codedecay --version"]
  }
};

const COMMAND_HANDLERS: Record<string, CliCommandHandler> = {
  agent: runAgentCommand,
  analyze: runAnalyzeCommand,
  config: runConfigCommand,
  differential: runDifferentialCommand,
  execute: runExecuteCommand,
  mcp: runMcpCommand,
  memory: runMemoryCommand,
  redteam: runRedteamCommand
};

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
  const runtimeCwd = runtime.cwd ?? process.cwd();

  if (!command || command === "--help" || command === "-h") {
    printHelp(runtime);
    return;
  }

  if (command === "help") {
    const topic = commandArgs[0];
    printHelp(runtime, topic === "--help" || topic === "-h" ? undefined : topic);
    return;
  }

  if (command === "--version" || command === "-V" || command === "version") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "version");
      return;
    }

    runVersionCommand(runtime);
    return;
  }

  if (command === "man") {
    const topic = commandArgs[0];
    if (topic === "--help" || topic === "-h") {
      printHelp(runtime, "man");
      return;
    }

    printManual(runtime, topic);
    return;
  }

  if (command === "update") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "update");
      return;
    }

    await runUpdateCommand({
      args: commandArgs,
      runtime,
      runtimeCwd
    });
    return;
  }

  if (command === "uninstall") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "uninstall");
      return;
    }

    await runUninstallCommand({
      args: commandArgs,
      runtime,
      runtimeCwd
    });
    return;
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    printHelp(runtime, command);
    return;
  }

  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    throwUnknownCommand(command);
  }

  await handler({
    args: commandArgs,
    runtime,
    runtimeCwd
  });
}

function runVersionCommand(runtime: CliRuntime): void {
  printVersion(runtime);
}

function runConfigCommand(context: CliCommandContext): void {
  const options = parseConfigArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  write(context.runtime.stdout, renderConfig(loadedConfig, options.format));
}

async function runUpdateCommand(context: CliCommandContext): Promise<void> {
  const options = parseUpdateArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const plan = createUpdatePlan(cwd, options);

  writeStdout(
    context.runtime,
    renderUpdatePlan({
      cwd,
      plan,
      apply: options.apply
    })
  );

  if (!options.apply) {
    return;
  }

  if (!plan.canApply) {
    throw new Error('No local package manager command can be applied automatically. Run "codedecay update" for guidance.');
  }

  const result = spawnSync(plan.command, plan.args, {
    cwd,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new CliExit(result.status ?? 1);
  }
}

async function runUninstallCommand(context: CliCommandContext): Promise<void> {
  const options = parseUninstallArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const plan = createUninstallPlan(cwd, options);

  writeStdout(
    context.runtime,
    renderUninstallPlan({
      cwd,
      plan,
      apply: options.apply,
      purgeLocal: options.purgeLocal
    })
  );

  if (!options.apply) {
    return;
  }

  const canPurge = options.purgeLocal && plan.purgeTargets.length > 0;
  if (!plan.canApplyPackage && !canPurge) {
    throw new Error('No uninstall actions are available. Run "codedecay uninstall" to inspect the cleanup plan.');
  }

  if (plan.canApplyPackage && plan.command) {
    const result = spawnSync(plan.command, plan.args, {
      cwd,
      stdio: "inherit"
    });

    if (result.status !== 0) {
      throw new CliExit(result.status ?? 1);
    }
  }

  if (canPurge) {
    for (const target of plan.purgeTargets) {
      rmSync(join(cwd, target), { recursive: true, force: true });
    }
  }
}

async function runMcpCommand(context: CliCommandContext): Promise<void> {
  const options = parseMcpArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const { startMcpServer } = await import("@submuxhq/codedecay-mcp");
  await startMcpServer({ cwd });
}

function runMemoryCommand(context: CliCommandContext): void {
  const options = parseMemoryArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  write(context.runtime.stdout, renderMemory(loadedMemory, options.format));
}

async function runExecuteCommand(context: CliCommandContext): Promise<void> {
  const options = parseExecuteArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  const report = await createExecutionReport(cwd, loadedConfig);
  const rendered = renderExecutionReport(report, options.format);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered,
    runtime: context.runtime
  });

  if (isExecutionFailure(report.summary.status)) {
    throw new CliExit(1);
  }
}

async function runDifferentialCommand(context: CliCommandContext): Promise<void> {
  const options = parseDifferentialArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const refs = requireDifferentialRefs(options);
  const rootDir = getRepoRootForCli(cwd, { base: refs.base, head: refs.head, format: "markdown" });
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  let report: DifferentialReport;

  try {
    report = await createDifferentialReport(rootDir, refs, loadedConfig);
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, rootDir, { base: refs.base, head: refs.head, format: "markdown" });
  }

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderDifferentialReport(report, options.format),
    runtime: context.runtime
  });

  if (isDifferentialFailure(report.summary.status)) {
    throw new CliExit(1);
  }
}

function runRedteamCommand(context: CliCommandContext): void {
  const options = parseRedteamArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const report = createRedteamReportForCli(cwd, options);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderRedteamReport(report, options.format),
    runtime: context.runtime
  });

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}

function runAgentCommand(context: CliCommandContext): void {
  const options = parseAgentArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const report = createRedteamReportForCli(cwd, options);
  const bundle = createAgentTaskBundle(report, { profile: options.profile });

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderAgentTaskBundle(bundle, options.format),
    runtime: context.runtime
  });
}

function runAnalyzeCommand(context: CliCommandContext): void {
  const options = parseAnalyzeArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, options);
  const { report } = createAnalysisContextForCli(rootDir, options);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderReport(report, options.format),
    runtime: context.runtime
  });

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}

function createRedteamReportForCli(cwd: string, options: AgentOptions | RedteamOptions) {
  const rootDir = getRepoRootForCli(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analysis = createAnalysisContextForCli(rootDir, options);
  const loadedSkills = loadCodeDecaySkills({ cwd: rootDir });

  return createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: analysis.loadedMemory.memory,
    memorySource: analysis.loadedMemory.sourcePath,
    skills: loadedSkills
  });
}

function createAnalysisContextForCli(rootDir: string, options: AnalyzeOptions): CliAnalysisContext {
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

  return {
    loadedMemory,
    report: createAnalysisReport({
      base: options.base,
      head: options.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory
    })
  };
}

function throwUnknownCommand(command: string): never {
  const suggestion = suggestClosestToken(command, [...Object.keys(HELP_DOCS), ...ROOT_FLAG_ALIASES]);
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
  throw new Error(`Unknown command: ${command}.${hint} Run "codedecay help" for available commands.`);
}

function throwUnknownOption(arg: string, command: keyof typeof HELP_DOCS): never {
  const suggestion = suggestClosestToken(arg, getKnownOptionFlags(command));
  const hint = suggestion ? ` Did you mean "${suggestion}"?` : "";
  throw new Error(`Unknown option for codedecay ${command}: ${arg}.${hint} Run "codedecay help ${command}" to see supported options.`);
}

function getKnownOptionFlags(command: keyof typeof HELP_DOCS): string[] {
  const doc = resolveHelpTopic(command);
  return [
    ...new Set([
      ...doc.options.map((option) => option.flag.split(" ", 1)[0] ?? option.flag),
      "--help",
      "-h"
    ])
  ];
}

function suggestClosestToken(input: string, candidates: string[]): string | undefined {
  const normalizedInput = normalizeSuggestionToken(input);
  if (!normalizedInput) {
    return undefined;
  }

  let bestCandidate: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSuggestionToken(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    if (normalizedCandidate === normalizedInput) {
      return candidate;
    }

    const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
    const isPrefixMatch =
      normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate);

    if (distance < bestDistance || (distance === bestDistance && isPrefixMatch)) {
      bestCandidate = candidate;
      bestDistance = distance;
    }
  }

  if (!bestCandidate) {
    return undefined;
  }

  const normalizedCandidate = normalizeSuggestionToken(bestCandidate);
  const threshold = Math.max(1, Math.floor(Math.max(normalizedInput.length, normalizedCandidate.length) / 3));
  const isPrefixMatch = normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate);

  return bestDistance <= threshold || isPrefixMatch ? bestCandidate : undefined;
}

function normalizeSuggestionToken(value: string): string {
  let normalized = value.trim().toLowerCase();
  normalized = normalized.split("=", 1)[0] ?? normalized;

  if (normalized.startsWith("--")) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith("-")) {
    normalized = normalized.slice(1);
  }

  return normalized.replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const deletion = (current[rightIndex - 1] ?? 0) + 1;
      const insertion = (previous[rightIndex] ?? 0) + 1;
      const substitution = (previous[rightIndex - 1] ?? 0) + substitutionCost;
      current[rightIndex] = Math.min(
        deletion,
        insertion,
        substitution
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
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

    throwUnknownOption(arg, "config");
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

    throwUnknownOption(arg, "mcp");
  }

  return options;
}

function parseUpdateArgs(args: string[]): UpdateOptions {
  const options: UpdateOptions = {
    apply: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
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

    if (arg.startsWith("--manager=")) {
      options.manager = parsePackageManager(arg.slice("--manager=".length));
      continue;
    }

    if (arg === "--manager") {
      options.manager = parsePackageManager(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "update");
  }

  return options;
}

function parseUninstallArgs(args: string[]): UninstallOptions {
  const options: UninstallOptions = {
    apply: false,
    purgeLocal: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--purge-local") {
      options.purgeLocal = true;
      continue;
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

    if (arg.startsWith("--manager=")) {
      options.manager = parsePackageManager(arg.slice("--manager=".length));
      continue;
    }

    if (arg === "--manager") {
      options.manager = parsePackageManager(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "uninstall");
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

    throwUnknownOption(arg, "memory");
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

    throwUnknownOption(arg, "execute");
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

    throwUnknownOption(arg, "differential");
  }

  return options;
}

function parseRedteamArgs(args: string[]): RedteamOptions {
  const options: RedteamOptions = {
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
      options.format = parseRedteamFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseRedteamFormat(requireValue(args, index, arg));
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

    throwUnknownOption(arg, "redteam");
  }

  return options;
}

function parseAgentArgs(args: string[]): AgentOptions {
  const options: AgentOptions = {
    format: "markdown",
    profile: "generic"
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
      options.format = parseAgentFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseAgentFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profile = parseAgentProfile(arg.slice("--profile=".length));
      continue;
    }

    if (arg === "--profile") {
      options.profile = parseAgentProfile(requireValue(args, index, arg));
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

    throwUnknownOption(arg, "agent");
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

    throwUnknownOption(arg, "analyze");
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

function parseRedteamFormat(value: string): RedteamFormat {
  if (VALID_CONFIG_FORMATS.has(value as RedteamFormat)) {
    return value as RedteamFormat;
  }

  throw new Error(`Invalid redteam format "${value}". Expected json or markdown.`);
}

function parseAgentFormat(value: string): AgentTaskBundleFormat {
  if (VALID_CONFIG_FORMATS.has(value as AgentTaskBundleFormat)) {
    return value as AgentTaskBundleFormat;
  }

  throw new Error(`Invalid agent format "${value}". Expected json or markdown.`);
}

function parseAgentProfile(value: string): AgentProfileId {
  if (isAgentProfileId(value)) {
    return value;
  }

  throw new Error(`Invalid agent profile "${value}". Expected ${AGENT_PROFILE_IDS.join(", ")}.`);
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

function parsePackageManager(value: string): PackageManager {
  if (VALID_PACKAGE_MANAGERS.has(value as PackageManager)) {
    return value as PackageManager;
  }

  throw new Error(`Invalid package manager "${value}". Expected npm, pnpm, yarn, or bun.`);
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

function writeCliOutput(input: {
  cwd: string;
  output?: string | undefined;
  rendered: string;
  runtime: CliRuntime;
}): void {
  if (input.output) {
    writeOutput(input.cwd, input.output, input.rendered);
    return;
  }

  write(input.runtime.stdout, input.rendered);
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

  const toolAdapterResults = await runConfiguredToolAdapters(rootDir, loadedConfig);

  const report: ExecutionReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: createExecutionSummary(adapterResults, toolAdapterResults, elapsed(startedAt)),
    results: adapterResults,
    toolAdapters: toolAdapterResults
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  return report;
}

async function runConfiguredToolAdapters(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<ExecutionToolAdapterResult[]> {
  const configuredToolAdapters = createConfiguredToolHarnesses(loadedConfig.config);
  const results: ExecutionToolAdapterResult[] = [];

  for (const configured of configuredToolAdapters) {
    const plan = await configured.harness.plan({
      cwd: rootDir,
      evidence: []
    });
    const context = configured.timeoutMs === undefined ? { cwd: rootDir } : { cwd: rootDir, timeoutMs: configured.timeoutMs };
    const result = await configured.harness.run(plan, context);
    const mapped: ExecutionToolAdapterResult = {
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
  results: ExecutionResult[],
  toolAdapters: ExecutionToolAdapterResult[],
  durationMs: number
): ExecutionSummary {
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

  if (report.results.length === 0 && report.toolAdapters.length === 0) {
    lines.push("No configured commands, probes, or tool adapters found.", "");
    return `${lines.join("\n")}\n`;
  }

  if (report.results.length > 0) {
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
    lines.push("");
  }

  if (report.toolAdapters.length > 0) {
    lines.push("### Tool Adapter Results", "");
    for (const result of report.toolAdapters) {
      lines.push(
        `- **${result.name}** (${result.kind}) ${formatStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
      );

      if (result.failure) {
        lines.push(`  - Failure: ${result.failure.mode}: ${result.failure.message}`);
      }

      appendToolEvidence(lines, result.evidence);
    }
    lines.push("");
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

function appendToolEvidence(lines: string[], evidence: Evidence[]): void {
  if (evidence.length === 0) {
    return;
  }

  lines.push("  - Evidence:");
  for (const item of evidence.slice(0, 5)) {
    lines.push(`    - ${formatEvidenceSeverity(item.severity)} ${item.kind}: ${item.summary}`);
  }
}

function formatEvidenceSeverity(severity: Evidence["severity"]): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
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
    `| API key env | ${config.llm.apiKeyEnv ? `\`${config.llm.apiKeyEnv}\`` : "none"} |`,
    `| Timeout | ${config.llm.timeoutMs}ms |`,
    "",
    "### Tool Adapters",
    ""
  ];

  appendConfigToolAdapters(lines, config.toolAdapters);

  lines.push(
    "### Probes",
    ""
  );

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

function appendConfigToolAdapters(
  lines: string[],
  toolAdapters: LoadedCodeDecayConfig["config"]["toolAdapters"]
): void {
  const rows = [
    formatConfigToolAdapter("Playwright", toolAdapters.playwright),
    formatConfigToolAdapter("StrykerJS", toolAdapters.stryker),
    formatConfigToolAdapter("Schemathesis", toolAdapters.schemathesis),
    formatConfigToolAdapter("Pact", toolAdapters.pact)
  ].filter((row): row is string => row !== undefined);

  if (rows.length === 0) {
    lines.push("No tool adapters configured.", "");
    return;
  }

  lines.push("| Adapter | Enabled | Command/details | Timeout |", "| --- | --- | --- | ---: |", ...rows, "");
}

function formatConfigToolAdapter(
  name: string,
  adapter: LoadedCodeDecayConfig["config"]["toolAdapters"][keyof LoadedCodeDecayConfig["config"]["toolAdapters"]]
): string | undefined {
  if (!adapter) {
    return undefined;
  }

  const details = [
    adapter.command ? `command: \`${adapter.command}\`` : "command: default",
    "schema" in adapter && adapter.schema ? `schema: \`${adapter.schema}\`` : undefined,
    "baseUrl" in adapter && adapter.baseUrl ? `baseUrl: \`${adapter.baseUrl}\`` : undefined
  ]
    .filter((item): item is string => item !== undefined)
    .join("<br>");

  return `| ${name} | ${adapter.enabled ? "yes" : "no"} | ${details} | ${adapter.timeoutMs ? `${adapter.timeoutMs}ms` : "default"} |`;
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

function printHelp(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(runtime, renderRootHelp());
    return;
  }

  writeStdout(runtime, renderCommandHelp(resolveHelpTopic(topic)));
}

function printManual(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(runtime, renderRootManual());
    return;
  }

  writeStdout(runtime, renderCommandManual(resolveHelpTopic(topic)));
}

function printVersion(runtime: CliRuntime): void {
  writeStdout(runtime, `${CODEDECAY_VERSION}\n`);
}

function resolveHelpTopic(topic: string): CommandDoc {
  const doc = HELP_DOCS[topic];
  if (doc) {
    return doc;
  }

  throwUnknownCommand(topic);
}

function renderRootHelp(): string {
  const lines = [
    "CodeDecay",
    "",
    "Find what your coding agent missed before merge.",
    "",
    "Usage:",
    "  codedecay <command> [options]",
    "  codedecay help [command]",
    "  codedecay man [command]",
    "  codedecay update [options]",
    "  codedecay uninstall [options]",
    "  codedecay version",
    "",
    "Commands:"
  ];

  appendCommandSummaries(lines, COMMAND_ORDER);

  lines.push("", "Utilities:");
  appendCommandSummaries(lines, UTILITY_COMMAND_ORDER);

  lines.push(
    "",
    "Global flags:",
    "  -h, --help                 Show help",
    "  -V, --version              Print the installed CodeDecay version",
    "",
    "Examples:",
    "  codedecay analyze --base main --head HEAD --format markdown",
    "  codedecay redteam --base main --head HEAD --format markdown",
    "  codedecay agent --profile codex --format markdown",
    "  codedecay help analyze",
    "  codedecay uninstall --purge-local",
    "  codedecay man update",
    "",
    'Run "codedecay help <command>" for command-specific flags.'
  );

  return `${lines.join("\n")}\n`;
}

function renderCommandHelp(doc: CommandDoc): string {
  const lines = [
    `CodeDecay ${doc.name}`,
    "",
    `${doc.summary}`,
    "",
    "Usage:"
  ];

  for (const usage of doc.usage) {
    lines.push(`  ${usage}`);
  }

  if (doc.description.length > 0) {
    lines.push("", "Description:");
    for (const paragraph of doc.description) {
      lines.push(`  ${paragraph}`);
    }
  }

  if (doc.options.length > 0) {
    lines.push("", "Options:");
    appendOptionDocs(lines, doc.options);
  }

  if (doc.examples.length > 0) {
    lines.push("", "Examples:");
    for (const example of doc.examples) {
      lines.push(`  ${example}`);
    }
  }

  if (doc.notes && doc.notes.length > 0) {
    lines.push("", "Notes:");
    for (const note of doc.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderRootManual(): string {
  const lines = [
    "CODEDECAY(1)",
    "",
    "NAME",
    "  codedecay - deterministic PR regression-risk and code-decay CLI",
    "",
    "SYNOPSIS",
    "  codedecay <command> [options]",
    "",
    "DESCRIPTION",
    "  CodeDecay is a local-first CLI for regression-risk analysis, blast-radius mapping, maintainability decay detection, weak-test auditing, and agent handoff workflows.",
    "  It does not require hosted services or hidden model calls to produce the core analysis.",
    "",
    "DISCOVERY",
    "  codedecay help <command>   Show concise command help",
    "  codedecay man <command>    Show a longer command manual",
    "  codedecay version          Print the installed version",
    "  codedecay update           Print the recommended upgrade command",
    "  codedecay uninstall       Print the recommended uninstall and cleanup plan",
    "",
    "COMMANDS"
  ];

  appendCommandSummaries(lines, COMMAND_ORDER);

  lines.push("", "UTILITIES");
  appendCommandSummaries(lines, UTILITY_COMMAND_ORDER);

  lines.push(
    "",
    "SAFETY",
    "  CodeDecay does not execute project commands unless they are explicitly configured and allowed by repo-local safety settings.",
    "  Redteam and agent workflows package evidence and recommendations without executing configured checks by default.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function renderCommandManual(doc: CommandDoc): string {
  const lines = [
    `CODEDECAY-${doc.name.toUpperCase()}(1)`,
    "",
    "NAME",
    `  codedecay ${doc.name} - ${doc.summary.toLowerCase()}`,
    "",
    "SYNOPSIS"
  ];

  for (const usage of doc.usage) {
    lines.push(`  ${usage}`);
  }

  if (doc.description.length > 0) {
    lines.push("", "DESCRIPTION");
    for (const paragraph of doc.description) {
      lines.push(`  ${paragraph}`);
    }
  }

  if (doc.options.length > 0) {
    lines.push("", "OPTIONS");
    appendOptionDocs(lines, doc.options);
  }

  if (doc.examples.length > 0) {
    lines.push("", "EXAMPLES");
    for (const example of doc.examples) {
      lines.push(`  ${example}`);
    }
  }

  if (doc.notes && doc.notes.length > 0) {
    lines.push("", "NOTES");
    for (const note of doc.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function appendCommandSummaries(lines: string[], commands: readonly string[]): void {
  for (const command of commands) {
    const doc = resolveHelpTopic(command);
    lines.push(`  ${doc.name.padEnd(12)} ${doc.summary}`);
  }
}

function appendOptionDocs(lines: string[], options: HelpOptionDoc[]): void {
  const width = Math.max(...options.map((option) => option.flag.length), 0);
  for (const option of options) {
    lines.push(`  ${option.flag.padEnd(width)}   ${option.description}`);
  }
}

function createUpdatePlan(cwd: string, options: UpdateOptions): UpdatePlan {
  const detection = options.manager ? { manager: options.manager, source: "override" } : detectPackageManager(cwd);
  const manager = detection?.manager;

  if (!manager) {
    return {
      source: "none",
      displayCommand: `npx -y ${PACKAGE_NAME}@latest --help`,
      command: "npx",
      args: ["-y", `${PACKAGE_NAME}@latest`, "--help"],
      canApply: false
    };
  }

  return {
    manager,
    source: detection?.source ?? "default",
    ...packageManagerInstallCommand(manager)
  };
}

function renderUpdatePlan(input: { cwd: string; plan: UpdatePlan; apply: boolean }): string {
  const lines = [
    "CodeDecay update",
    "",
    `Current CLI version: ${CODEDECAY_VERSION}`,
    `Working directory: ${input.cwd}`
  ];

  if (input.plan.manager) {
    lines.push(`Package manager: ${input.plan.manager} (${input.plan.source})`);
  } else {
    lines.push("Package manager: not detected");
  }

  lines.push("", "Recommended command:", `  ${input.plan.displayCommand}`);

  if (input.apply) {
    lines.push("");
    if (input.plan.canApply) {
      lines.push("Applying update command...");
    } else {
      lines.push("Automatic apply is unavailable for this update plan.");
    }
  } else {
    lines.push("", 'Run "codedecay update --apply" to execute it automatically.');
  }

  return `${lines.join("\n")}\n`;
}

function createUninstallPlan(cwd: string, options: UninstallOptions): UninstallPlan {
  const detection = options.manager ? { manager: options.manager, source: "override" } : detectPackageManager(cwd);
  const dependency = detectPackageDependency(cwd);
  const purgeTargets = options.purgeLocal ? detectPurgeTargets(cwd) : [];
  const manager = detection?.manager;

  if (!manager) {
    return {
      source: "none",
      args: [],
      canApplyPackage: false,
      dependencyLocation: dependency.location,
      dependencyVersion: dependency.version,
      purgeTargets
    };
  }

  const removal = packageManagerRemoveCommand(manager);
  return {
    manager,
    source: detection?.source ?? "default",
    displayCommand: removal.displayCommand,
    command: removal.command,
    args: removal.args,
    canApplyPackage: dependency.location !== "none",
    dependencyLocation: dependency.location,
    dependencyVersion: dependency.version,
    purgeTargets
  };
}

function renderUninstallPlan(input: {
  cwd: string;
  plan: UninstallPlan;
  apply: boolean;
  purgeLocal: boolean;
}): string {
  const lines = [
    "CodeDecay uninstall",
    "",
    `Current CLI version: ${CODEDECAY_VERSION}`,
    `Working directory: ${input.cwd}`
  ];

  if (input.plan.manager) {
    lines.push(`Package manager: ${input.plan.manager} (${input.plan.source})`);
  } else {
    lines.push("Package manager: not detected");
  }

  const location =
    input.plan.dependencyLocation === "none"
      ? "not listed in package.json"
      : `${input.plan.dependencyLocation}${input.plan.dependencyVersion ? ` (${input.plan.dependencyVersion})` : ""}`;
  lines.push(`Package entry: ${location}`);

  lines.push("");
  if (input.plan.displayCommand) {
    lines.push("Recommended uninstall command:", `  ${input.plan.displayCommand}`);
  } else {
    lines.push(`No supported package manager command detected for ${PACKAGE_NAME}.`);
  }

  lines.push("");
  if (input.purgeLocal) {
    lines.push("Local purge targets:");
    if (input.plan.purgeTargets.length === 0) {
      lines.push("  none detected");
    } else {
      for (const target of input.plan.purgeTargets) {
        lines.push(`  ${target}`);
      }
    }
  } else {
    lines.push("Local purge targets: skipped");
    lines.push('  Pass "--purge-local" to also remove `.codedecay/` and detected CodeDecay report artifacts.');
  }

  lines.push(
    "",
    "Notes:",
    "  - Uninstall does not rewrite CI workflows, package scripts, or docs references automatically.",
    "  - Review GitHub Actions and README snippets manually if this repo integrated CodeDecay there."
  );

  if (input.apply) {
    lines.push("");
    if (input.plan.canApplyPackage || (input.purgeLocal && input.plan.purgeTargets.length > 0)) {
      lines.push("Applying uninstall plan...");
    } else {
      lines.push("Automatic apply is unavailable for this uninstall plan.");
    }
  } else {
    lines.push("", 'Run "codedecay uninstall --apply" to execute the plan.');
  }

  return `${lines.join("\n")}\n`;
}

function detectPackageManager(cwd: string): { manager: PackageManager; source: string } | undefined {
  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { packageManager?: string | undefined };
      const configured = normalizePackageManager(parsed.packageManager);
      if (configured) {
        return { manager: configured, source: "package.json#packageManager" };
      }
    } catch {
      // Ignore unreadable package.json for manager detection.
    }
  }

  const lockfiles: Array<[string, PackageManager]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"]
  ];

  for (const [filename, manager] of lockfiles) {
    if (existsSync(join(cwd, filename))) {
      return { manager, source: filename };
    }
  }

  if (existsSync(packageJsonPath)) {
    return { manager: "npm", source: "package.json (default)" };
  }

  return undefined;
}

function normalizePackageManager(value: string | undefined): PackageManager | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.split("@", 1)[0];
  return VALID_PACKAGE_MANAGERS.has(normalized as PackageManager) ? (normalized as PackageManager) : undefined;
}

function detectPackageDependency(
  cwd: string
): { location: "devDependencies" | "dependencies" | "optionalDependencies" | "none"; version?: string } {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return { location: "none" };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string> | undefined;
      devDependencies?: Record<string, string> | undefined;
      optionalDependencies?: Record<string, string> | undefined;
    };

    for (const section of ["devDependencies", "dependencies", "optionalDependencies"] as const) {
      const version = parsed[section]?.[PACKAGE_NAME];
      if (version) {
        return { location: section, version };
      }
    }
  } catch {
    // Ignore unreadable package.json when detecting dependency placement.
  }

  return { location: "none" };
}

function detectPurgeTargets(cwd: string): string[] {
  const targets = new Set<string>();

  if (existsSync(join(cwd, ".codedecay"))) {
    targets.add(".codedecay");
  }

  for (const entry of readdirSync(cwd)) {
    if (CODEDECAY_PURGE_FILE_PATTERN.test(entry)) {
      targets.add(entry);
    }
  }

  return [...targets].sort((left, right) => left.localeCompare(right));
}

function packageManagerInstallCommand(manager: PackageManager): Omit<UpdatePlan, "manager" | "source"> {
  switch (manager) {
    case "pnpm":
      return {
        displayCommand: `pnpm add -D ${PACKAGE_NAME}@latest`,
        command: "pnpm",
        args: ["add", "-D", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
    case "yarn":
      return {
        displayCommand: `yarn add -D ${PACKAGE_NAME}@latest`,
        command: "yarn",
        args: ["add", "-D", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
    case "bun":
      return {
        displayCommand: `bun add -d ${PACKAGE_NAME}@latest`,
        command: "bun",
        args: ["add", "-d", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
    case "npm":
    default:
      return {
        displayCommand: `npm install -D ${PACKAGE_NAME}@latest`,
        command: "npm",
        args: ["install", "-D", `${PACKAGE_NAME}@latest`],
        canApply: true
      };
  }
}

function packageManagerRemoveCommand(
  manager: PackageManager
): Pick<UninstallPlan, "displayCommand" | "command" | "args"> {
  switch (manager) {
    case "pnpm":
      return {
        displayCommand: `pnpm remove ${PACKAGE_NAME}`,
        command: "pnpm",
        args: ["remove", PACKAGE_NAME]
      };
    case "yarn":
      return {
        displayCommand: `yarn remove ${PACKAGE_NAME}`,
        command: "yarn",
        args: ["remove", PACKAGE_NAME]
      };
    case "bun":
      return {
        displayCommand: `bun remove ${PACKAGE_NAME}`,
        command: "bun",
        args: ["remove", PACKAGE_NAME]
      };
    case "npm":
    default:
      return {
        displayCommand: `npm uninstall ${PACKAGE_NAME}`,
        command: "npm",
        args: ["uninstall", PACKAGE_NAME]
      };
  }
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
