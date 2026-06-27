import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
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
import {
  loadCodeDecayConfig,
  type CodeDecayProductApiEndpoint,
  type CodeDecayProductTarget,
  type LoadedCodeDecayConfig
} from "@submuxhq/codedecay-config";
import {
  CODEDECAY_VERSION,
  createAnalysisReport,
  riskLevelFromScore,
  shouldFailForRisk,
  type CodeDecayReport,
  type RiskLevel,
  type TestEvidenceMode
} from "@submuxhq/codedecay-core";
import { checkCommandSafety, runConfiguredCommand, type CommandExecutionResult, type ExecutionStatus } from "@submuxhq/codedecay-execution";
import { createGitWorktree, getGitChangedFiles, getRepoRoot, removeGitWorktree } from "@submuxhq/codedecay-git";
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import { createLlmProvider, type LlmCompletion, type LlmSuggestion } from "@submuxhq/codedecay-llm";
import {
  applyMemoryContext,
  importCodeDecayMemory,
  learnCodeDecayMemory,
  loadCodeDecayMemory,
  writeCodeDecayMemory,
  type LoadedCodeDecayMemory
} from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, type RedteamFormat } from "@submuxhq/codedecay-redteam";
import { renderReport, type ReportFormat } from "@submuxhq/codedecay-report";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { createConfiguredToolHarnesses, type ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";
import YAML from "yaml";

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

interface MemoryImportOptions {
  cwd?: string | undefined;
  input: string;
  format: ConfigFormat;
  apply: boolean;
}

interface MemoryLearnOptions {
  cwd?: string | undefined;
  input: string;
  format: ConfigFormat;
  apply: boolean;
}

interface SnapshotOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  compare?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

interface LlmReviewOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  task?: string | undefined;
  ping: boolean;
}

interface ExecuteOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

interface ProductOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  target?: string | undefined;
  explore: boolean;
  generateTests: boolean;
  runGeneratedTests: boolean;
  generateApiTests: boolean;
  runGeneratedApiTests: boolean;
  maxPages: number;
  maxActions: number;
  allowDestructiveActions: boolean;
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

interface ProductTargetReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  configSource?: string | undefined;
  summary: ProductTargetSummary;
  targets: ProductTargetResult[];
  safety: ProductTargetSafetySummary;
}

interface ProductTargetSummary {
  status: ProductTargetStatus;
  total: number;
  ready: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  timedOut: number;
  durationMs: number;
}

type ProductTargetStatus = "passed" | "failed" | "skipped" | "blocked" | "timed_out";

interface ProductTargetResult {
  id: string;
  status: ProductTargetStatus;
  readiness: CodeDecayProductTarget["readiness"];
  baseUrl?: string | undefined;
  healthCheck?: string | undefined;
  timeoutMs: number;
  durationMs: number;
  setup?: CommandExecutionResult | undefined;
  start?: ProductStartResult | undefined;
  health?: ProductHealthResult | undefined;
  exploration?: ProductExplorationResult | undefined;
  generatedTests?: ProductGeneratedTestsResult | undefined;
  generatedTestRun?: ProductGeneratedTestRunResult | undefined;
  generatedApiTests?: ProductGeneratedTestsResult | undefined;
  generatedApiTestRun?: ProductGeneratedTestRunResult | undefined;
  teardown?: CommandExecutionResult | undefined;
  notes: string[];
}

interface ProductStartResult {
  command: string;
  status: "started" | "skipped" | "blocked" | "error";
  durationMs: number;
  stdout: string;
  stderr: string;
  pid?: number | undefined;
  error?: string | undefined;
  blockedReason?: string | undefined;
}

interface ManagedProductProcess extends ProductStartResult {
  child?: ChildProcessWithoutNullStreams | undefined;
}

interface ProductHealthResult {
  url: string;
  status: ProductTargetStatus;
  attempts: number;
  durationMs: number;
  httpStatus?: number | undefined;
  error?: string | undefined;
}

interface ProductExplorationResult {
  status: ProductTargetStatus;
  driver: "playwright";
  artifactPath?: string | undefined;
  pages: number;
  interactiveElements: number;
  blockedActions: number;
  skippedActions: number;
  durationMs: number;
  error?: string | undefined;
  notes: string[];
}

interface ProductGeneratedTestsResult {
  status: ProductTargetStatus;
  sourcePath?: string | undefined;
  manifestPath?: string | undefined;
  tests: ProductGeneratedTestCase[];
  durationMs: number;
  error?: string | undefined;
  notes: string[];
}

interface ProductGeneratedTestCase {
  id: string;
  title: string;
  kind: "route-load" | "link-navigation" | "input-state" | "form-visibility" | "api-operation";
  pageUrl: string;
  selector?: string | undefined;
  targetUrl?: string | undefined;
  method?: string | undefined;
  operationPath?: string | undefined;
  operationId?: string | undefined;
  expectedStatuses?: number[] | undefined;
  headers?: Record<string, string> | undefined;
  requestBody?: unknown;
  destructive?: boolean | undefined;
  priority: "high" | "medium" | "low";
}

interface ProductGeneratedTestManifest {
  schemaVersion: 1;
  generatedAt: string;
  target: {
    id: string;
    baseUrl: string;
  };
  sourceFlowMapPath?: string | undefined;
  sourceOpenApiSchemaPath?: string | undefined;
  sourceApiEndpoints?: string | undefined;
  testSourcePath: string;
  reviewRequired: true;
  promoteByCopyingTo: string;
  tests: ProductGeneratedTestCase[];
}

interface ProductGeneratedTestRunResult {
  status: ProductTargetStatus;
  command?: string | undefined;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: ProductGeneratedTestFailure[];
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  notes: string[];
}

interface ProductGeneratedTestFailure {
  testId?: string | undefined;
  title: string;
  failingStep: string;
  error: string;
  request?: ProductGeneratedTestFailureRequest | undefined;
  expected?: string | undefined;
  actual?: string | undefined;
  impactedFiles?: string[] | undefined;
  testSourcePath: string;
  testSource: string;
  rerunCommand: string;
}

interface ProductGeneratedTestFailureRequest {
  method: string;
  url: string;
}

interface ProductExplorerOptions {
  maxPages: number;
  maxActions: number;
  allowDestructiveActions: boolean;
}

interface ProductFlowMap {
  schemaVersion: 1;
  generatedAt: string;
  target: {
    id: string;
    baseUrl: string;
    origin: string;
  };
  driver: "playwright";
  limits: {
    sameOrigin: true;
    maxPages: number;
    maxActions: number;
    allowDestructiveActions: boolean;
  };
  summary: {
    pages: number;
    interactiveElements: number;
    blockedActions: number;
    skippedActions: number;
  };
  pages: ProductFlowPage[];
  blockedActions: ProductBlockedAction[];
}

interface ProductFlowPage {
  url: string;
  title: string;
  path: string;
  depth: number;
  links: ProductFlowLink[];
  interactiveElements: ProductInteractiveElement[];
  screenshotPath?: string | undefined;
}

interface ProductFlowLink {
  href: string;
  text: string;
  selector: string;
  sameOrigin: boolean;
  discovered: boolean;
}

interface ProductInteractiveElement {
  kind: "link" | "form" | "button" | "input";
  selector: string;
  name: string;
  action?: string | undefined;
  method?: string | undefined;
  inputType?: string | undefined;
  destructive: boolean;
  blocked: boolean;
  blockReason?: string | undefined;
}

interface ProductBlockedAction {
  pageUrl: string;
  selector: string;
  name: string;
  reason: string;
}

interface ProductTargetSafetySummary {
  commandsExecuted: boolean;
  browserAutomationRan: boolean;
  generatedTestsRan: boolean;
  startupCommandsAllowed: boolean;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
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

interface TrendSnapshot {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  base?: string | undefined;
  head?: string | undefined;
  summary: {
    mergeRiskScore: number;
    decayScore: number;
    riskLevel: RiskLevel;
    changedFiles: number;
    impactedAreas: number;
    impactedRoutes: number;
    findingCounts: Record<RiskLevel, number>;
    missingTestFindings: number;
    weakTestFindings: number;
    evidenceMode: TestEvidenceMode;
    highRiskFiles: string[];
    impactedAreaKinds: string[];
  };
}

interface TrendSnapshotComparison {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  current: TrendSnapshot;
  previous: TrendSnapshot;
  delta: {
    mergeRiskScore: number;
    decayScore: number;
    changedFiles: number;
    impactedAreas: number;
    impactedRoutes: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    missingTestFindings: number;
    weakTestFindings: number;
  };
}

interface LlmReviewReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  mode: "ping" | "review";
  configSource?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
  provider: {
    id: string;
    configuredProvider: "disabled" | "ollama" | "litellm";
    model?: string | undefined;
    endpoint?: string | undefined;
    apiKeyEnv?: string | undefined;
    timeoutMs: number;
  };
  summary?: {
    mergeRiskScore: number;
    decayScore: number;
    riskLevel: RiskLevel;
    changedFiles: number;
    impactedAreas: number;
    impactedRoutes: number;
    evidenceMode: TestEvidenceMode;
  };
  suggestions: LlmSuggestion[];
  rawText: string;
  untrusted: true;
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
const COMMAND_ORDER = ["analyze", "snapshot", "redteam", "llm-review", "agent", "config", "memory", "memory-import", "memory-learn", "execute", "differential", "product", "mcp"] as const;
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
  snapshot: {
    name: "snapshot",
    summary: "Stable repository health snapshot and trend comparison.",
    usage: ["codedecay snapshot [options]"],
    description: [
      "Emit a stable JSON or Markdown snapshot for the current PR or working tree, and optionally compare it with a previous snapshot artifact."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--compare <path>", description: "Previous snapshot JSON file to compare against" },
      { flag: "--format <format>", description: "json or markdown (default: json)" },
      { flag: "--output <path>", description: "Write snapshot or comparison output to a file instead of stdout" }
    ],
    examples: [
      "codedecay snapshot --format json --output .codedecay/snapshot.json",
      "codedecay snapshot --base main --head HEAD --compare .codedecay/previous-snapshot.json --format markdown"
    ]
  },
  redteam: {
    name: "redteam",
    summary: "Merge-safety report with impact, weak-test evidence, edge cases, and fix tasks.",
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
  "llm-review": {
    name: "llm-review",
    summary: "Optional LLM-assisted review suggestions grounded in deterministic analysis.",
    usage: ["codedecay llm-review [options]"],
    description: [
      "Load the configured user-owned LLM provider, ground it in CodeDecay's deterministic PR analysis, and request untrusted review suggestions."
    ],
    options: [
      { flag: "--base <ref>", description: "Base git ref to compare from" },
      { flag: "--head <ref>", description: "Head git ref to compare to" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write the LLM review output to a file instead of stdout" },
      { flag: "--task <text>", description: "Override the default review task prompt" },
      { flag: "--ping", description: "Validate provider connectivity without sending PR analysis context" }
    ],
    examples: [
      "codedecay llm-review --ping",
      "codedecay llm-review --base main --head HEAD --format markdown",
      "codedecay llm-review --task \"Focus on auth regressions and missing route checks\" --format json"
    ],
    notes: [
      "This command is explicit opt-in. Deterministic analyze, redteam, agent, and snapshot commands do not call models by default.",
      "LLM suggestions are untrusted until verified by tests, configured checks, or manual review."
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
  "memory-import": {
    name: "memory-import",
    summary: "Merge structured CI, incident, or PR learnings into local repo memory.",
    usage: ["codedecay memory-import --input <path> [options]"],
    description: [
      "Load a structured import file, normalize it into CodeDecay memory sections, preview the merged result, and optionally write it to `.codedecay/memory.json`."
    ],
    options: [
      { flag: "--input <path>", description: "JSON file containing memory sections or imported learnings" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown preview format (default: markdown)" },
      { flag: "--apply", description: "Write the merged memory file instead of only printing the preview" }
    ],
    examples: [
      "codedecay memory-import --input .codedecay/import.json",
      "codedecay memory-import --cwd ../my-repo --input incidents.json --apply"
    ]
  },
  "memory-learn": {
    name: "memory-learn",
    summary: "Learn local repo memory from CI, PR, and CodeDecay report signals.",
    usage: ["codedecay memory-learn --input <path> [options]"],
    description: [
      "Convert raw-ish CI failures, merged PR descriptions, commit messages, and CodeDecay fail-on reports into reviewable `.codedecay/memory.json` entries."
    ],
    options: [
      { flag: "--input <path>", description: "JSON file containing ciFailures, pullRequests, reports, failOnReports, or a CodeDecay report" },
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--format <format>", description: "json or markdown preview format (default: markdown)" },
      { flag: "--apply", description: "Write the learned memory file instead of only printing the preview" }
    ],
    examples: [
      "codedecay memory-learn --input ci-failure.json",
      "codedecay memory-learn --input codedecay-report.json --apply"
    ],
    notes: [
      "Learning is deterministic and local. CodeDecay does not inspect remote CI, PRs, or GitHub automatically."
    ]
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
  product: {
    name: "product",
    summary: "Check configured live app product targets.",
    usage: ["codedecay product [options]"],
    description: [
      "Inspect configured product testing targets, optionally start local targets when commands are explicitly allowed, and poll their health checks or base URLs."
    ],
    options: [
      { flag: "--cwd <path>", description: "Repository working directory (default: current directory)" },
      { flag: "--target <id>", description: "Run only one configured product target" },
      { flag: "--explore", description: "Use a project-provided Playwright install to crawl same-origin product flows" },
      { flag: "--generate-tests", description: "Generate reviewable Playwright regression tests from the target flow map" },
      { flag: "--run-generated-tests", description: "Run generated Playwright tests through the target repo's local Playwright CLI" },
      { flag: "--generate-api-tests", description: "Generate reviewable API regression tests from a configured OpenAPI schema" },
      { flag: "--run-generated-api-tests", description: "Run generated API tests through the target repo's local Playwright CLI" },
      { flag: "--max-pages <count>", description: "Maximum pages to visit during --explore (default: 10)" },
      { flag: "--max-actions <count>", description: "Maximum interactive elements to record during --explore (default: 50)" },
      { flag: "--allow-destructive-actions", description: "Record destructive forms/actions as allowed instead of blocked" },
      { flag: "--format <format>", description: "json or markdown (default: markdown)" },
      { flag: "--output <path>", description: "Write product target report to a file instead of stdout" }
    ],
    examples: [
      "codedecay product --format markdown",
      "codedecay product --target web --format json",
      "codedecay product --target web --explore --max-pages 5 --format markdown",
      "codedecay product --target web --generate-tests --run-generated-tests --format markdown",
      "codedecay product --target api --generate-api-tests --run-generated-api-tests --format markdown"
    ],
    notes: [
      "Product target commands run only when they are configured and `safety.allowCommands` is true.",
      "Existing `baseUrl` and preview URL targets are checked without starting commands.",
      "`--explore` is an explicit execution workflow and requires `safety.allowCommands: true` plus a project-provided Playwright install.",
      "Generated tests are written under `.codedecay/local/generated-tests/` and `.codedecay/local/generated-api-tests/` for review; CodeDecay never commits or promotes them automatically."
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
  "llm-review": runLlmReviewCommand,
  mcp: runMcpCommand,
  memory: runMemoryCommand,
  "memory-import": runMemoryImportCommand,
  "memory-learn": runMemoryLearnCommand,
  product: runProductCommand,
  redteam: runRedteamCommand,
  snapshot: runSnapshotCommand
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

function runMemoryImportCommand(context: CliCommandContext): void {
  const options = parseMemoryImportArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const inputPath = resolve(context.runtimeCwd, options.input);
  const rawImport = JSON.parse(readFileSync(inputPath, "utf8"));
  const imported = importCodeDecayMemory(loadedMemory.memory, rawImport, inputPath);
  const writtenPath = options.apply ? writeCodeDecayMemory(rootDir, imported.memory) : undefined;

  write(
    context.runtime.stdout,
    renderMemoryImportResult({
      format: options.format,
      inputPath,
      writtenPath,
      result: imported
    })
  );
}

function runMemoryLearnCommand(context: CliCommandContext): void {
  const options = parseMemoryLearnArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const inputPath = resolve(context.runtimeCwd, options.input);
  const rawLearning = JSON.parse(readFileSync(inputPath, "utf8"));
  const learned = learnCodeDecayMemory(loadedMemory.memory, rawLearning, inputPath);
  const writtenPath = options.apply ? writeCodeDecayMemory(rootDir, learned.memory) : undefined;

  write(
    context.runtime.stdout,
    renderMemoryLearnResult({
      format: options.format,
      inputPath,
      writtenPath,
      result: learned
    })
  );
}

function runSnapshotCommand(context: CliCommandContext): void {
  const options = parseSnapshotArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, options);
  const analysis = createAnalysisContextForCli(rootDir, options);
  const snapshot = createTrendSnapshot(analysis.report);
  const rendered = options.compare
    ? renderTrendSnapshotComparison(createTrendSnapshotComparison(snapshot, loadTrendSnapshot(resolve(context.runtimeCwd, options.compare))), options.format)
    : renderTrendSnapshot(snapshot, options.format);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered,
    runtime: context.runtime
  });
}

async function runLlmReviewCommand(context: CliCommandContext): Promise<void> {
  const options = parseLlmReviewArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const report = await createLlmReviewForCli(cwd, options);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderLlmReviewReport(report, options.format),
    runtime: context.runtime
  });
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

async function runProductCommand(context: CliCommandContext): Promise<void> {
  const options = parseProductArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  const report = await createProductTargetReport(cwd, loadedConfig, options);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderProductTargetReport(report, options.format),
    runtime: context.runtime
  });

  if (isProductTargetFailure(report.summary.status)) {
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

function createAnalysisContextForCli(rootDir: string, options: AnalyzeOptions | SnapshotOptions | LlmReviewOptions): CliAnalysisContext {
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

async function createLlmReviewForCli(cwd: string, options: LlmReviewOptions): Promise<LlmReviewReport> {
  const rootDir = getRepoRootForCli(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const llmConfig = loadedConfig.config.llm;

  if (llmConfig.provider === "disabled") {
    throw new Error(
      'LLM review requires llm.provider to be set to "ollama" or "litellm". See docs/llm-providers.md and run "codedecay config --format markdown" to verify the loaded config.'
    );
  }

  let provider;
  try {
    provider = createLlmProvider(llmConfig);
  } catch (error: unknown) {
    throw formatLlmReviewError(error, llmConfig.provider);
  }

  let analysis: CliAnalysisContext | undefined;
  if (!options.ping) {
    analysis = createAnalysisContextForCli(rootDir, options);
  }

  let completion: LlmCompletion;
  try {
    completion = await provider.complete({
      task: options.task ?? (options.ping ? "Validate CodeDecay LLM provider connectivity." : "Find overlooked regression risks and stronger verification steps for this pull request."),
      instructions: options.ping
        ? "Return JSON when possible with an empty suggestions array. This is a provider connectivity and configuration check."
        : [
            "Ground your review in the deterministic CodeDecay evidence below.",
            "Focus on overlooked regression risks, missing real-world paths, and stronger verification ideas.",
            "If a route or API boundary is already identified, reason from that boundary instead of giving generic advice.",
            "Do not propose commands to execute.",
            "Return at most 8 suggestions as structured JSON when possible."
          ].join(" "),
      context: options.ping ? { tool: "CodeDecay", mode: "llm-review-ping" } : summarizeReportForLlmReview(analysis?.report)
    });
  } catch (error: unknown) {
    throw formatLlmReviewError(error, llmConfig.provider);
  }

  const audit = analysis ? createTestProofAudit(analysis.report) : undefined;
  const report: LlmReviewReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    mode: options.ping ? "ping" : "review",
    provider: {
      id: completion.providerId,
      configuredProvider: llmConfig.provider,
      timeoutMs: llmConfig.timeoutMs
    },
    suggestions: completion.suggestions,
    rawText: completion.text,
    untrusted: true
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  if (analysis?.report.base) {
    report.base = analysis.report.base;
  }

  if (analysis?.report.head) {
    report.head = analysis.report.head;
  }

  if (completion.model ?? llmConfig.model) {
    report.provider.model = completion.model ?? llmConfig.model;
  }

  if (llmConfig.endpoint) {
    report.provider.endpoint = llmConfig.endpoint;
  }

  if (llmConfig.apiKeyEnv) {
    report.provider.apiKeyEnv = llmConfig.apiKeyEnv;
  }

  if (analysis) {
    report.summary = {
      mergeRiskScore: analysis.report.summary.mergeRiskScore,
      decayScore: analysis.report.summary.decayScore,
      riskLevel: analysis.report.summary.riskLevel,
      changedFiles: analysis.report.changedFiles.length,
      impactedAreas: analysis.report.impactedAreas.length,
      impactedRoutes: analysis.report.impactedRoutes?.length ?? 0,
      evidenceMode: audit?.evidenceMode ?? "heuristic_only"
    };
  }

  return report;
}

function summarizeReportForLlmReview(report: CodeDecayReport | undefined): Record<string, unknown> | undefined {
  if (!report) {
    return undefined;
  }

  const testAudit = createTestProofAudit(report);
  return {
    summary: {
      mergeRiskScore: report.summary.mergeRiskScore,
      decayScore: report.summary.decayScore,
      riskLevel: report.summary.riskLevel,
      findingCounts: report.summary.findingCounts,
      mergeRiskBreakdown: report.summary.mergeRiskBreakdown,
      decayBreakdown: report.summary.decayBreakdown,
      testEvidence: report.testEvidence,
      testAuditStatus: testAudit.status,
      evidenceMode: testAudit.evidenceMode
    },
    changedFiles: report.changedFiles.map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions
    })),
    impactedAreas: report.impactedAreas,
    impactedRoutes: report.impactedRoutes ?? [],
    findings: report.findings.slice(0, 20),
    recommendedTests: report.recommendedTests.slice(0, 20)
  };
}

function formatLlmReviewError(
  error: unknown,
  provider: "disabled" | "ollama" | "litellm"
): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("llm.model") || message.includes("llm.endpoint")) {
    return new Error(`${message} Run "codedecay config --format markdown" to verify your llm settings.`);
  }

  if (message.includes("could not read API key from environment variable")) {
    return new Error(`${message} Export the configured variable, then rerun "codedecay llm-review --ping".`);
  }

  if (provider === "ollama" && /fetch support|ECONNREFUSED|request failed|abort/i.test(message)) {
    return new Error(`${message} Ensure Ollama is running at the configured endpoint and the model is available before rerunning "codedecay llm-review --ping".`);
  }

  if (provider === "litellm" && /request failed|401|403|404|message content|choices/i.test(message)) {
    return new Error(`${message} Verify the LiteLLM/OpenAI-compatible endpoint, model name, and API key configuration, then rerun "codedecay llm-review --ping".`);
  }

  return new Error(message);
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

function parseMemoryImportArgs(args: string[]): MemoryImportOptions {
  const options: MemoryImportOptions = {
    input: "",
    format: "markdown",
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

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--input") {
      options.input = requireValue(args, index, arg);
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

    throwUnknownOption(arg, "memory-import");
  }

  if (!options.input) {
    throw new Error('Missing value for --input. Use "codedecay help memory-import" for usage.');
  }

  return options;
}

function parseMemoryLearnArgs(args: string[]): MemoryLearnOptions {
  const options: MemoryLearnOptions = {
    input: "",
    format: "markdown",
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

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--input") {
      options.input = requireValue(args, index, arg);
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

    throwUnknownOption(arg, "memory-learn");
  }

  if (!options.input) {
    throw new Error('Missing value for --input. Use "codedecay help memory-learn" for usage.');
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

function parseProductArgs(args: string[]): ProductOptions {
  const options: ProductOptions = {
    format: "markdown",
    explore: false,
    generateTests: false,
    runGeneratedTests: false,
    generateApiTests: false,
    runGeneratedApiTests: false,
    maxPages: 10,
    maxActions: 50,
    allowDestructiveActions: false
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

    if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
      continue;
    }

    if (arg === "--target") {
      options.target = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--explore") {
      options.explore = true;
      continue;
    }

    if (arg === "--generate-tests") {
      options.generateTests = true;
      continue;
    }

    if (arg === "--run-generated-tests") {
      options.runGeneratedTests = true;
      continue;
    }

    if (arg === "--generate-api-tests") {
      options.generateApiTests = true;
      continue;
    }

    if (arg === "--run-generated-api-tests") {
      options.runGeneratedApiTests = true;
      continue;
    }

    if (arg.startsWith("--max-pages=")) {
      options.maxPages = parsePositiveInteger(arg.slice("--max-pages=".length), "--max-pages");
      continue;
    }

    if (arg === "--max-pages") {
      options.maxPages = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-actions=")) {
      options.maxActions = parsePositiveInteger(arg.slice("--max-actions=".length), "--max-actions");
      continue;
    }

    if (arg === "--max-actions") {
      options.maxActions = parsePositiveInteger(requireValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--allow-destructive-actions") {
      options.allowDestructiveActions = true;
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

    throwUnknownOption(arg, "product");
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

function parseSnapshotArgs(args: string[]): SnapshotOptions {
  const options: SnapshotOptions = {
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

    if (arg.startsWith("--compare=")) {
      options.compare = arg.slice("--compare=".length);
      continue;
    }

    if (arg === "--compare") {
      options.compare = requireValue(args, index, arg);
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

    throwUnknownOption(arg, "snapshot");
  }

  return options;
}

function parseLlmReviewArgs(args: string[]): LlmReviewOptions {
  const options: LlmReviewOptions = {
    format: "markdown",
    ping: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--ping") {
      options.ping = true;
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

    if (arg.startsWith("--task=")) {
      options.task = arg.slice("--task=".length);
      continue;
    }

    if (arg === "--task") {
      options.task = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "llm-review");
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

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new Error(`Invalid value for ${flag}: expected a positive integer.`);
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

function renderLlmReviewReport(report: LlmReviewReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay LLM Review",
    "",
    `**Mode:** ${report.mode}`,
    `**Provider:** ${report.provider.id}`,
    `**Model:** ${report.provider.model ? `\`${report.provider.model}\`` : "unknown"}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Setting | Value |",
    "| --- | --- |",
    `| Configured provider | ${report.provider.configuredProvider} |`,
    `| Endpoint | ${report.provider.endpoint ? `\`${report.provider.endpoint}\`` : "default"} |`,
    `| API key env | ${report.provider.apiKeyEnv ? `\`${report.provider.apiKeyEnv}\`` : "none"} |`,
    `| Timeout | ${report.provider.timeoutMs}ms |`,
    `| Structured suggestions | ${report.suggestions.length} |`,
    ""
  ];

  if (report.summary) {
    lines.push(
      "### Deterministic Context",
      "",
      "| Signal | Value |",
      "| --- | ---: |",
      `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
      `| Decay risk | ${report.summary.decayScore}/100 |`,
      `| Risk level | ${report.summary.riskLevel} |`,
      `| Changed files | ${report.summary.changedFiles} |`,
      `| Impacted areas | ${report.summary.impactedAreas} |`,
      `| Impacted routes/APIs | ${report.summary.impactedRoutes} |`,
      `| Test evidence mode | ${report.summary.evidenceMode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"} |`,
      ""
    );
  }

  lines.push("### Suggestions", "");
  if (report.suggestions.length === 0) {
    lines.push("No structured suggestions were returned.", "");
  } else {
    for (const suggestion of report.suggestions) {
      lines.push(
        `- **${suggestion.title}**${suggestion.severity ? ` (${suggestion.severity})` : ""}: ${suggestion.detail}`
      );
      if (suggestion.evidence && suggestion.evidence.length > 0) {
        lines.push(`  Evidence: ${suggestion.evidence.join("; ")}`);
      }
    }
    lines.push("");
  }

  if (report.rawText.trim()) {
    lines.push("### Raw Provider Response", "", "```text");
    for (const line of trimLongOutput(report.rawText.trim()).split(/\r?\n/)) {
      lines.push(line);
    }
    lines.push("```", "");
  }

  lines.push(
    "### Notes",
    "",
    "This command is explicit opt-in and separate from deterministic analyze, redteam, agent, and snapshot workflows.",
    "LLM suggestions are untrusted until verified by tests, configured checks, or manual review.",
    ""
  );

  return `${lines.join("\n")}\n`;
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

function renderMemoryImportResult(input: {
  format: ConfigFormat;
  inputPath: string;
  writtenPath?: string | undefined;
  result: ReturnType<typeof importCodeDecayMemory>;
}): string {
  if (input.format === "json") {
    return `${JSON.stringify(
      {
        tool: "CodeDecay",
        version: CODEDECAY_VERSION,
        inputPath: input.inputPath,
        writtenPath: input.writtenPath,
        added: input.result.added,
        merged: input.result.merged,
        memory: input.result.memory
      },
      null,
      2
    )}\n`;
  }

  const lines = [
    "## CodeDecay Memory Import",
    "",
    `**Input:** \`${input.inputPath}\``,
    `**Applied:** ${input.writtenPath ? "yes" : "no"}`,
    input.writtenPath ? `**Written to:** \`${input.writtenPath}\`` : "**Written to:** preview only",
    "",
    "| Section | Added | Merged |",
    "| --- | ---: | ---: |",
    `| Flows | ${input.result.added.flows} | ${input.result.merged.flows} |`,
    `| Commands | ${input.result.added.commands} | ${input.result.merged.commands} |`,
    `| Invariants | ${input.result.added.invariants} | ${input.result.merged.invariants} |`,
    `| Architecture notes | ${input.result.added.architecture} | ${input.result.merged.architecture} |`,
    `| Past regressions | ${input.result.added.regressions} | ${input.result.merged.regressions} |`,
    "",
    renderMemory({ memory: input.result.memory, sourcePath: input.writtenPath }, "markdown").trim(),
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function renderMemoryLearnResult(input: {
  format: ConfigFormat;
  inputPath: string;
  writtenPath?: string | undefined;
  result: ReturnType<typeof learnCodeDecayMemory>;
}): string {
  if (input.format === "json") {
    return `${JSON.stringify(
      {
        tool: "CodeDecay",
        version: CODEDECAY_VERSION,
        inputPath: input.inputPath,
        writtenPath: input.writtenPath,
        learned: input.result.learned,
        added: input.result.added,
        merged: input.result.merged,
        memory: input.result.memory
      },
      null,
      2
    )}\n`;
  }

  const lines = [
    "## CodeDecay Memory Learn",
    "",
    `**Input:** \`${input.inputPath}\``,
    `**Applied:** ${input.writtenPath ? "yes" : "no"}`,
    input.writtenPath ? `**Written to:** \`${input.writtenPath}\`` : "**Written to:** preview only",
    "",
    "| Section | Learned | Added | Merged |",
    "| --- | ---: | ---: | ---: |",
    `| Flows | ${input.result.learned.flows} | ${input.result.added.flows} | ${input.result.merged.flows} |`,
    `| Commands | ${input.result.learned.commands} | ${input.result.added.commands} | ${input.result.merged.commands} |`,
    `| Invariants | ${input.result.learned.invariants} | ${input.result.added.invariants} | ${input.result.merged.invariants} |`,
    `| Architecture notes | ${input.result.learned.architecture} | ${input.result.added.architecture} | ${input.result.merged.architecture} |`,
    `| Past regressions | ${input.result.learned.regressions} | ${input.result.added.regressions} | ${input.result.merged.regressions} |`,
    "",
    renderMemory({ memory: input.result.memory, sourcePath: input.writtenPath }, "markdown").trim(),
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function createTrendSnapshot(report: CodeDecayReport): TrendSnapshot {
  const audit = createTestProofAudit(report);
  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    base: report.base,
    head: report.head,
    summary: {
      mergeRiskScore: report.summary.mergeRiskScore,
      decayScore: report.summary.decayScore,
      riskLevel: report.summary.riskLevel,
      changedFiles: report.changedFiles.length,
      impactedAreas: report.impactedAreas.length,
      impactedRoutes: report.impactedRoutes?.length ?? 0,
      findingCounts: report.summary.findingCounts,
      missingTestFindings: audit.missingTestFindings.length,
      weakTestFindings: audit.weakTestFindings.length,
      evidenceMode: audit.evidenceMode,
      highRiskFiles: [
        ...new Set(report.findings.filter((finding) => finding.severity === "high" && finding.file).map((finding) => finding.file ?? ""))
      ].sort((left, right) => left.localeCompare(right)),
      impactedAreaKinds: [...new Set(report.impactedAreas.map((area) => area.kind))].sort((left, right) => left.localeCompare(right))
    }
  };
}

function createTrendSnapshotComparison(current: TrendSnapshot, previous: TrendSnapshot): TrendSnapshotComparison {
  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    current,
    previous,
    delta: {
      mergeRiskScore: current.summary.mergeRiskScore - previous.summary.mergeRiskScore,
      decayScore: current.summary.decayScore - previous.summary.decayScore,
      changedFiles: current.summary.changedFiles - previous.summary.changedFiles,
      impactedAreas: current.summary.impactedAreas - previous.summary.impactedAreas,
      impactedRoutes: current.summary.impactedRoutes - previous.summary.impactedRoutes,
      highFindings: current.summary.findingCounts.high - previous.summary.findingCounts.high,
      mediumFindings: current.summary.findingCounts.medium - previous.summary.findingCounts.medium,
      lowFindings: current.summary.findingCounts.low - previous.summary.findingCounts.low,
      missingTestFindings: current.summary.missingTestFindings - previous.summary.missingTestFindings,
      weakTestFindings: current.summary.weakTestFindings - previous.summary.weakTestFindings
    }
  };
}

function loadTrendSnapshot(path: string): TrendSnapshot {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as TrendSnapshot;
  if (!parsed || parsed.tool !== "CodeDecay" || !parsed.summary) {
    throw new Error(`Invalid CodeDecay snapshot: ${path}`);
  }

  return parsed;
}

function renderTrendSnapshot(snapshot: TrendSnapshot, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(snapshot, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay Snapshot",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Merge risk | ${snapshot.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${snapshot.summary.decayScore}/100 |`,
    `| Risk level | ${snapshot.summary.riskLevel} |`,
    `| Changed files | ${snapshot.summary.changedFiles} |`,
    `| Impacted areas | ${snapshot.summary.impactedAreas} |`,
    `| Impacted routes/APIs | ${snapshot.summary.impactedRoutes} |`,
    `| Missing-test findings | ${snapshot.summary.missingTestFindings} |`,
    `| Weak-test findings | ${snapshot.summary.weakTestFindings} |`,
    `| Evidence mode | ${snapshot.summary.evidenceMode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"} |`,
    ""
  ];

  if (snapshot.summary.highRiskFiles.length > 0) {
    lines.push("High-risk files:");
    for (const file of snapshot.summary.highRiskFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  if (snapshot.summary.impactedAreaKinds.length > 0) {
    lines.push(`Impacted area kinds: ${snapshot.summary.impactedAreaKinds.join(", ")}`, "");
  }

  return `${lines.join("\n")}\n`;
}

function renderTrendSnapshotComparison(comparison: TrendSnapshotComparison, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(comparison, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay Snapshot Comparison",
    "",
    "| Metric | Previous | Current | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| Merge risk | ${comparison.previous.summary.mergeRiskScore} | ${comparison.current.summary.mergeRiskScore} | ${comparison.delta.mergeRiskScore} |`,
    `| Decay risk | ${comparison.previous.summary.decayScore} | ${comparison.current.summary.decayScore} | ${comparison.delta.decayScore} |`,
    `| Changed files | ${comparison.previous.summary.changedFiles} | ${comparison.current.summary.changedFiles} | ${comparison.delta.changedFiles} |`,
    `| Impacted areas | ${comparison.previous.summary.impactedAreas} | ${comparison.current.summary.impactedAreas} | ${comparison.delta.impactedAreas} |`,
    `| Impacted routes/APIs | ${comparison.previous.summary.impactedRoutes} | ${comparison.current.summary.impactedRoutes} | ${comparison.delta.impactedRoutes} |`,
    `| High findings | ${comparison.previous.summary.findingCounts.high} | ${comparison.current.summary.findingCounts.high} | ${comparison.delta.highFindings} |`,
    `| Weak-test findings | ${comparison.previous.summary.weakTestFindings} | ${comparison.current.summary.weakTestFindings} | ${comparison.delta.weakTestFindings} |`,
    ""
  ];

  const previousAreas = new Set(comparison.previous.summary.impactedAreaKinds);
  const currentAreas = new Set(comparison.current.summary.impactedAreaKinds);
  const addedAreas = [...currentAreas].filter((area) => !previousAreas.has(area)).sort((left, right) => left.localeCompare(right));
  const removedAreas = [...previousAreas].filter((area) => !currentAreas.has(area)).sort((left, right) => left.localeCompare(right));
  if (addedAreas.length > 0) {
    lines.push(`Added impacted areas: ${addedAreas.join(", ")}`);
  }
  if (removedAreas.length > 0) {
    lines.push(`Removed impacted areas: ${removedAreas.join(", ")}`);
  }
  if (addedAreas.length > 0 || removedAreas.length > 0) {
    lines.push("");
  }

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

function appendCodeBlock(lines: string[], language: string, source: string): void {
  const trimmed = source.trim();
  if (!trimmed) {
    return;
  }

  lines.push(`    \`\`\`${language}`);
  for (const line of trimmed.split(/\r?\n/)) {
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

async function createProductTargetReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  options: ProductOptions
): Promise<ProductTargetReport> {
  const startedAt = Date.now();
  const allTargets = Object.values(loadedConfig.config.productTesting.targets).sort((left, right) => left.id.localeCompare(right.id));
  const targets = selectProductTargets(allTargets, options.target);
  if ((options.explore || options.generateTests || options.runGeneratedTests || options.generateApiTests || options.runGeneratedApiTests) && targets.length === 0) {
    throw new Error("codedecay product execution workflows require at least one configured productTesting target.");
  }

  const results: ProductTargetResult[] = [];

  for (const target of targets) {
    results.push(await runProductTarget(rootDir, loadedConfig, target, options));
  }

  const report: ProductTargetReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: createProductTargetSummary(results, elapsed(startedAt)),
    targets: results,
    safety: {
      commandsExecuted: results.some((result) => commandActuallyExecuted(result.setup) || commandActuallyExecuted(result.teardown) || result.start?.status === "started"),
      browserAutomationRan: results.some((result) => result.exploration?.status === "passed" || result.exploration?.status === "failed"),
      generatedTestsRan: results.some((result) => result.generatedTestRun !== undefined || result.generatedApiTestRun !== undefined),
      startupCommandsAllowed: loadedConfig.config.safety.allowCommands,
      telemetrySent: false,
      cloudDependency: false,
      notes: [
        "Product target checks are explicit and local-first.",
        "CodeDecay only runs configured product target commands when safety.allowCommands is true.",
        "Existing baseUrl and preview URL targets can be health-checked without startup commands.",
        "Product exploration uses a project-provided Playwright install and never installs browsers.",
        "Generated tests are review artifacts unless --run-generated-tests or --run-generated-api-tests is explicitly used."
      ]
    }
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  return report;
}

function selectProductTargets(targets: CodeDecayProductTarget[], requestedTarget: string | undefined): CodeDecayProductTarget[] {
  if (!requestedTarget) {
    return targets;
  }

  const target = targets.find((candidate) => candidate.id === requestedTarget);
  if (!target) {
    const available = targets.length > 0 ? targets.map((candidate) => candidate.id).join(", ") : "none";
    throw new Error(`Unknown product target "${requestedTarget}". Available targets: ${available}.`);
  }

  return [target];
}

async function runProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  options: ProductOptions
): Promise<ProductTargetResult> {
  const startedAt = Date.now();
  const notes = [...target.readiness.notes];
  let setup: CommandExecutionResult | undefined;
  let startResult: ManagedProductProcess | undefined;
  let health: ProductHealthResult | undefined;
  let exploration: ProductExplorationResult | undefined;
  let generatedTests: ProductGeneratedTestsResult | undefined;
  let generatedTestRun: ProductGeneratedTestRunResult | undefined;
  let generatedApiTests: ProductGeneratedTestsResult | undefined;
  let generatedApiTestRun: ProductGeneratedTestRunResult | undefined;
  let teardown: CommandExecutionResult | undefined;
  let status: ProductTargetStatus = "skipped";
  let shouldRunHealthCheck = true;

  try {
    if (target.authSetupCommand) {
      setup = await runProductOneShotCommand(rootDir, loadedConfig, target.authSetupCommand, target.timeoutMs);
      if (setup.status !== "passed") {
        status = productStatusFromRequiredCommand(setup.status);
        notes.push("Auth setup command did not pass; health checking was skipped.");
        shouldRunHealthCheck = false;
      }
    }

    if (shouldRunHealthCheck && target.startCommand) {
      startResult = await startManagedProductProcess(rootDir, loadedConfig, target.startCommand, target.timeoutMs);
      if (startResult.status !== "started") {
        status = startResult.status === "blocked" ? "blocked" : "failed";
        notes.push("Start command did not produce a managed running process; health checking was skipped.");
        shouldRunHealthCheck = false;
      }
    }

    if (shouldRunHealthCheck) {
      const healthUrl = target.healthCheck ?? target.readiness.effectiveBaseUrl ?? target.baseUrl;
      if (!healthUrl) {
        status = target.readiness.status === "needs-command-approval" || target.readiness.status === "missing-preview-url" ? "blocked" : "skipped";
        notes.push("No healthCheck, baseUrl, or resolved preview URL is available for product target polling.");
        shouldRunHealthCheck = false;
      } else {
        health = await pollProductHealth(healthUrl, target.timeoutMs);
        status = health.status;
      }
    }

    if (options.explore) {
      if (health?.status === "passed") {
        exploration = await exploreProductTarget(rootDir, loadedConfig, target, health, {
          maxPages: options.maxPages,
          maxActions: options.maxActions,
          allowDestructiveActions: options.allowDestructiveActions
        });
        if (exploration.status !== "passed") {
          status = exploration.status;
        }
      } else if (!isProductTargetFailure(status)) {
        status = "blocked";
        exploration = {
          status: "blocked",
          driver: "playwright",
          pages: 0,
          interactiveElements: 0,
          blockedActions: 0,
          skippedActions: 0,
          durationMs: 0,
          error: "Product exploration requires a healthy target URL.",
          notes: ["Run a target with baseUrl, resolved previewUrlEnv, or healthCheck before exploration."]
        };
      }
    }

    if (options.generateTests || options.runGeneratedTests) {
      generatedTests = options.generateTests
        ? generateProductTestsForTarget(rootDir, target, exploration?.artifactPath)
        : loadGeneratedProductTestsForTarget(rootDir, target);
      if (generatedTests.status !== "passed") {
        status = generatedTests.status;
      } else if (options.runGeneratedTests) {
        generatedTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedTests, "--run-generated-tests");
        if (generatedTestRun.status !== "passed") {
          status = generatedTestRun.status;
        }
      }
    }

    if (options.generateApiTests || options.runGeneratedApiTests) {
      generatedApiTests = options.generateApiTests
        ? generateProductApiTestsForTarget(rootDir, loadedConfig, target, health, options.allowDestructiveActions)
        : loadGeneratedProductApiTestsForTarget(rootDir, target);
      if (generatedApiTests.status !== "passed") {
        status = generatedApiTests.status;
      } else if (options.runGeneratedApiTests) {
        generatedApiTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedApiTests, "--run-generated-api-tests");
        if (generatedApiTestRun.status !== "passed") {
          status = generatedApiTestRun.status;
        }
      }
    }
  } finally {
    if (startResult?.child) {
      await stopManagedProductProcess(startResult.child);
    }

    if (target.teardownCommand && (startResult?.status === "started" || setup?.status === "passed")) {
      teardown = await runProductOneShotCommand(rootDir, loadedConfig, target.teardownCommand, target.timeoutMs);
      if (teardown.status !== "passed" && !isProductTargetFailure(status)) {
        status = productStatusFromRequiredCommand(teardown.status);
        notes.push("Teardown command did not pass after product target execution.");
      }
    }
  }

  return createProductTargetResult(
    target,
    status,
    startedAt,
    notes,
    setup,
    startResult,
    health,
    exploration,
    generatedTests,
    generatedTestRun,
    generatedApiTests,
    generatedApiTestRun,
    teardown
  );
}

function createProductTargetResult(
  target: CodeDecayProductTarget,
  status: ProductTargetStatus,
  startedAt: number,
  notes: string[],
  setup: CommandExecutionResult | undefined,
  start: ManagedProductProcess | undefined,
  health: ProductHealthResult | undefined,
  exploration: ProductExplorationResult | undefined,
  generatedTests: ProductGeneratedTestsResult | undefined,
  generatedTestRun: ProductGeneratedTestRunResult | undefined,
  generatedApiTests: ProductGeneratedTestsResult | undefined,
  generatedApiTestRun: ProductGeneratedTestRunResult | undefined,
  teardown: CommandExecutionResult | undefined
): ProductTargetResult {
  const result: ProductTargetResult = {
    id: target.id,
    status,
    readiness: target.readiness,
    baseUrl: target.readiness.effectiveBaseUrl ?? target.baseUrl,
    healthCheck: target.healthCheck,
    timeoutMs: target.timeoutMs,
    durationMs: elapsed(startedAt),
    notes
  };

  if (setup) {
    result.setup = setup;
  }

  if (start) {
    const { child: _child, ...serializableStart } = start;
    result.start = serializableStart;
  }

  if (health) {
    result.health = health;
  }

  if (exploration) {
    result.exploration = exploration;
  }

  if (generatedTests) {
    result.generatedTests = generatedTests;
  }

  if (generatedTestRun) {
    result.generatedTestRun = generatedTestRun;
  }

  if (generatedApiTests) {
    result.generatedApiTests = generatedApiTests;
  }

  if (generatedApiTestRun) {
    result.generatedApiTestRun = generatedApiTestRun;
  }

  if (teardown) {
    result.teardown = teardown;
  }

  return result;
}

async function runProductOneShotCommand(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<CommandExecutionResult> {
  return await runConfiguredCommand({
    command,
    cwd: rootDir,
    timeoutMs,
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
}

async function startManagedProductProcess(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<ManagedProductProcess> {
  const startedAt = Date.now();
  if (!loadedConfig.config.safety.allowCommands) {
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: "Product target startup is disabled by config safety.allowCommands.",
      blockedReason: "safety.allowCommands is false"
    };
  }

  const safety = checkCommandSafety(command);
  if (!safety.safe) {
    const message = `Command was blocked by CodeDecay safety policy: ${safety.reason}.`;
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: safety.reason
    };
  }

  let stdout = "";
  let stderr = "";
  let spawnError: Error | undefined;
  const child = spawn(command, {
    cwd: rootDir,
    shell: true,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1"
    }
  });

  child.stdout.on("data", (chunk: Buffer) => {
    stdout = appendLimitedOutput(stdout, chunk.toString("utf8"), 16 * 1024);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendLimitedOutput(stderr, chunk.toString("utf8"), 16 * 1024);
  });

  child.on("error", (error) => {
    spawnError = error;
  });

  await delay(Math.min(250, Math.max(50, Math.floor(timeoutMs / 10))));

  if (spawnError) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: spawnError.message
    };
  }

  if (child.exitCode !== null) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: `Start command exited early with code ${child.exitCode}.`
    };
  }

  return {
    command,
    status: "started",
    durationMs: elapsed(startedAt),
    stdout,
    stderr,
    pid: child.pid,
    child
  };
}

async function stopManagedProductProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 1000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function pollProductHealth(url: string, timeoutMs: number): Promise<ProductHealthResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  while (Date.now() <= deadline) {
    attempts += 1;
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(2500, remainingMs));

    try {
      const response = await fetch(url, {
        signal: controller.signal
      });
      lastStatus = response.status;

      if (response.status >= 200 && response.status < 400) {
        clearTimeout(timeout);
        return {
          url,
          status: "passed",
          attempts,
          durationMs: elapsed(startedAt),
          httpStatus: response.status
        };
      }

      lastError = `Health check returned HTTP ${response.status}.`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }

    await delay(Math.min(500, Math.max(0, deadline - Date.now())));
  }

  return {
    url,
    status: "timed_out",
    attempts,
    durationMs: elapsed(startedAt),
    httpStatus: lastStatus,
    error: lastError ? `Timed out waiting for a healthy response: ${lastError}` : "Timed out waiting for a healthy response."
  };
}

async function exploreProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult,
  options: ProductExplorerOptions
): Promise<ProductExplorationResult> {
  const startedAt = Date.now();
  const baseUrl = resolveProductExploreBaseUrl(target, health);
  const notes = [
    "Explorer uses same-origin crawling by default.",
    "Destructive forms and actions are recorded as blocked unless --allow-destructive-actions is set."
  ];

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires safety.allowCommands to be true.",
      notes
    };
  }

  if (!baseUrl) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires a baseUrl, resolved previewUrlEnv, or healthCheck URL.",
      notes
    };
  }

  const playwright = loadProjectPlaywright(rootDir);
  if (!playwright.ok) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: playwright.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install browsers or packages."]
    };
  }

  let browser: ProductPlaywrightBrowser | undefined;
  try {
    browser = await playwright.module.chromium.launch({ headless: true });
    const artifactRoot = join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(target.id));
    const flowMap = await crawlProductFlowMap({
      browser,
      rootDir,
      artifactRoot,
      target,
      baseUrl,
      options,
      timeoutMs: target.timeoutMs
    });
    const artifactPath = join(artifactRoot, "flow-map.json");
    writeOutput(rootDir, artifactPath, `${JSON.stringify(flowMap, null, 2)}\n`);

    return {
      status: "passed",
      driver: "playwright",
      artifactPath,
      pages: flowMap.summary.pages,
      interactiveElements: flowMap.summary.interactiveElements,
      blockedActions: flowMap.summary.blockedActions,
      skippedActions: flowMap.summary.skippedActions,
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: `Playwright product exploration failed: ${message}`,
      notes: [...notes, "CodeDecay does not install Playwright browsers; run the project's normal Playwright setup if browser launch fails."]
    };
  } finally {
    await browser?.close?.();
  }
}

interface ProductPlaywrightModule {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<ProductPlaywrightBrowser>;
  };
}

interface ProductPlaywrightBrowser {
  newPage: () => Promise<ProductPlaywrightPage>;
  close?: () => Promise<void>;
}

interface ProductPlaywrightPage {
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  title?: () => Promise<string>;
  url?: () => string;
  screenshot?: (options: { path: string; fullPage: boolean }) => Promise<unknown>;
  close?: () => Promise<void>;
}

function loadProjectPlaywright(rootDir: string): { ok: true; module: ProductPlaywrightModule } | { ok: false; error: string } {
  try {
    const projectRequire = createRequire(join(rootDir, "package.json"));
    const loaded = projectRequire("playwright") as Partial<ProductPlaywrightModule>;
    if (!loaded.chromium?.launch) {
      return {
        ok: false,
        error: "Project Playwright package does not expose chromium.launch."
      };
    }

    return {
      ok: true,
      module: loaded as ProductPlaywrightModule
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Playwright is not installed or cannot be loaded from the target project: ${message}`
    };
  }
}

async function crawlProductFlowMap(input: {
  browser: ProductPlaywrightBrowser;
  rootDir: string;
  artifactRoot: string;
  target: CodeDecayProductTarget;
  baseUrl: string;
  options: ProductExplorerOptions;
  timeoutMs: number;
}): Promise<ProductFlowMap> {
  const startUrl = normalizeExploreUrl(input.baseUrl);
  const origin = new URL(startUrl).origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const queued = new Set([startUrl]);
  const visited = new Set<string>();
  const pages: ProductFlowPage[] = [];
  const crawlState = {
    recordedActions: 0,
    skippedActions: 0,
    blockedActions: [] as ProductBlockedAction[]
  };
  const page = await input.browser.newPage();

  try {
    while (queue.length > 0 && pages.length < input.options.maxPages) {
      const next = queue.shift();
      if (!next || visited.has(next.url)) {
        continue;
      }

      visited.add(next.url);
      await page.goto(next.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(input.timeoutMs, 30_000)
      });
      const currentUrl = normalizeExploreUrl(page.url?.() ?? next.url);
      if (new URL(currentUrl).origin !== origin) {
        continue;
      }

      const html = await page.content();
      const title = page.title ? await page.title().catch(() => extractHtmlTitle(html)) : extractHtmlTitle(html);
      const extracted = extractProductFlowPage({
        url: currentUrl,
        html,
        origin,
        depth: next.depth,
        options: input.options,
        state: crawlState
      });
      const screenshotPath = await captureProductScreenshot({
        page,
        rootDir: input.rootDir,
        artifactRoot: input.artifactRoot,
        url: currentUrl
      });

      pages.push({
        ...extracted,
        title: title || extracted.title,
        ...(screenshotPath ? { screenshotPath } : {})
      });

      for (const link of extracted.links) {
        if (!link.discovered || queued.has(link.href) || visited.has(link.href)) {
          continue;
        }

        queued.add(link.href);
        queue.push({ url: link.href, depth: next.depth + 1 });
      }
    }
  } finally {
    await page.close?.();
  }

  const interactiveElements = pages.reduce((count, item) => count + item.interactiveElements.length, 0);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: input.target.id,
      baseUrl: startUrl,
      origin
    },
    driver: "playwright",
    limits: {
      sameOrigin: true,
      maxPages: input.options.maxPages,
      maxActions: input.options.maxActions,
      allowDestructiveActions: input.options.allowDestructiveActions
    },
    summary: {
      pages: pages.length,
      interactiveElements,
      blockedActions: crawlState.blockedActions.length,
      skippedActions: crawlState.skippedActions
    },
    pages,
    blockedActions: crawlState.blockedActions
  };
}

function extractProductFlowPage(input: {
  url: string;
  html: string;
  origin: string;
  depth: number;
  options: ProductExplorerOptions;
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  };
}): ProductFlowPage {
  const links = extractProductLinks(input.html, input.url, input.origin);
  const interactiveElements: ProductInteractiveElement[] = [];

  for (const link of links) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, {
      kind: "link",
      selector: link.selector,
      name: link.text,
      action: link.href,
      destructive: false,
      blocked: false
    });
  }

  for (const form of extractProductForms(input.html, input.url)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, form);
  }

  for (const button of extractProductButtons(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, button);
  }

  for (const inputElement of extractProductInputs(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, inputElement);
  }

  return {
    url: input.url,
    title: extractHtmlTitle(input.html),
    path: new URL(input.url).pathname || "/",
    depth: input.depth,
    links,
    interactiveElements
  };
}

function appendInteractiveElement(
  elements: ProductInteractiveElement[],
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  },
  options: ProductExplorerOptions,
  pageUrl: string,
  element: ProductInteractiveElement
): void {
  if (state.recordedActions >= options.maxActions) {
    state.skippedActions += 1;
    return;
  }

  const blockedElement =
    element.destructive && !options.allowDestructiveActions
      ? {
          ...element,
          blocked: true,
          blockReason: element.blockReason ?? "Potentially destructive product action."
        }
      : {
          ...element,
          blocked: false,
          blockReason: undefined
        };

  elements.push(blockedElement);
  state.recordedActions += 1;

  if (blockedElement.blocked) {
    state.blockedActions.push({
      pageUrl,
      selector: blockedElement.selector,
      name: blockedElement.name,
      reason: blockedElement.blockReason ?? "Potentially destructive product action."
    });
  }
}

function extractProductLinks(html: string, baseUrl: string, origin: string): ProductFlowLink[] {
  const links: ProductFlowLink[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const attrs = parseHtmlAttributes(match[1] ?? "");
    const rawHref = attrs.href;
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) {
      continue;
    }

    const href = resolveMaybeUrl(rawHref, baseUrl);
    if (!href || seen.has(href)) {
      continue;
    }

    seen.add(href);
    const sameOrigin = new URL(href).origin === origin;
    links.push({
      href,
      text: accessibleName(attrs, stripHtml(match[2] ?? ""), rawHref),
      selector: `a[href="${escapeSelectorValue(rawHref)}"]`,
      sameOrigin,
      discovered: sameOrigin
    });
  }

  return links.sort((left, right) => left.href.localeCompare(right.href));
}

function extractProductForms(html: string, baseUrl: string): ProductInteractiveElement[] {
  const forms: ProductInteractiveElement[] = [];
  const formPattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = formPattern.exec(html)) !== null) {
    index += 1;
    const attrs = parseHtmlAttributes(match[1] ?? "");
    const method = (attrs.method ?? "get").toLowerCase();
    const rawAction = attrs.action ?? baseUrl;
    const action = resolveMaybeUrl(rawAction, baseUrl) ?? rawAction;
    const text = stripHtml(match[2] ?? "");
    const name = accessibleName(attrs, text, `form ${index}`);
    const destructive = method !== "get" || isDestructiveText(`${name} ${method} ${rawAction}`);

    forms.push({
      kind: "form",
      selector: selectorFromAttrs("form", attrs, index),
      name,
      action,
      method,
      destructive,
      blocked: destructive,
      blockReason: destructive ? `Form method ${method.toUpperCase()} may mutate product state.` : undefined
    });
  }

  return forms;
}

function extractProductButtons(html: string): ProductInteractiveElement[] {
  const buttons: ProductInteractiveElement[] = [];
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = buttonPattern.exec(html)) !== null) {
    index += 1;
    const attrs = parseHtmlAttributes(match[1] ?? "");
    const name = accessibleName(attrs, stripHtml(match[2] ?? ""), `button ${index}`);
    const type = (attrs.type ?? "submit").toLowerCase();
    const destructive = isDestructiveText(`${name} ${type}`);

    buttons.push({
      kind: "button",
      selector: selectorFromAttrs("button", attrs, index),
      name,
      inputType: type,
      destructive,
      blocked: destructive,
      blockReason: destructive ? "Button name or type matches a destructive action pattern." : undefined
    });
  }

  return buttons;
}

function extractProductInputs(html: string): ProductInteractiveElement[] {
  const inputs: ProductInteractiveElement[] = [];
  const inputPattern = /<input\b([^>]*)>/gi;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = inputPattern.exec(html)) !== null) {
    index += 1;
    const attrs = parseHtmlAttributes(match[1] ?? "");
    const type = (attrs.type ?? "text").toLowerCase();
    const name = accessibleName(attrs, attrs.value ?? attrs.placeholder ?? "", `input ${index}`);
    const destructive = ["submit", "button", "reset"].includes(type) && isDestructiveText(`${name} ${type}`);

    inputs.push({
      kind: "input",
      selector: selectorFromAttrs("input", attrs, index),
      name,
      inputType: type,
      destructive,
      blocked: destructive,
      blockReason: destructive ? "Input action matches a destructive action pattern." : undefined
    });
  }

  return inputs;
}

async function captureProductScreenshot(input: {
  page: ProductPlaywrightPage;
  rootDir: string;
  artifactRoot: string;
  url: string;
}): Promise<string | undefined> {
  if (!input.page.screenshot) {
    return undefined;
  }

  const screenshotPath = join(input.artifactRoot, "screenshots", `${sanitizeArtifactSegment(new URL(input.url).pathname || "root")}.png`);
  try {
    mkdirSync(dirname(join(input.rootDir, screenshotPath)), { recursive: true });
    await input.page.screenshot({
      path: join(input.rootDir, screenshotPath),
      fullPage: true
    });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

function resolveProductExploreBaseUrl(target: CodeDecayProductTarget, health: ProductHealthResult): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  const healthOrigin = resolveMaybeUrl(health.url, health.url);
  return healthOrigin ? new URL(healthOrigin).origin : undefined;
}

function normalizeExploreUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "") || url.origin;
}

function resolveMaybeUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return undefined;
  }
}

function parseHtmlAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/=`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    if (!key) {
      continue;
    }

    attrs[key] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function selectorFromAttrs(tag: string, attrs: Record<string, string>, index: number): string {
  if (attrs.id) {
    return `${tag}#${escapeSelectorValue(attrs.id)}`;
  }

  if (attrs.name) {
    return `${tag}[name="${escapeSelectorValue(attrs.name)}"]`;
  }

  if (attrs["aria-label"]) {
    return `${tag}[aria-label="${escapeSelectorValue(attrs["aria-label"])}"]`;
  }

  if (attrs.type) {
    return `${tag}[type="${escapeSelectorValue(attrs.type)}"]:nth-of-type(${index})`;
  }

  return `${tag}:nth-of-type(${index})`;
}

function accessibleName(attrs: Record<string, string>, text: string, fallback: string): string {
  const candidate = attrs["aria-label"] ?? attrs.title ?? attrs.name ?? attrs.value ?? attrs.placeholder ?? text;
  const cleaned = normalizeWhitespace(candidate);
  return cleaned || fallback;
}

function extractHtmlTitle(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? normalizeWhitespace(stripHtml(match[1] ?? "")) : "";
}

function stripHtml(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isDestructiveText(value: string): boolean {
  return /\b(delete|remove|destroy|drop|reset|purchase|payment|checkout|confirm|submit|disable|revoke|archive)\b/i.test(value);
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sanitizeArtifactSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "root";
}

function generateProductTestsForTarget(
  rootDir: string,
  target: CodeDecayProductTarget,
  flowMapArtifactPath: string | undefined
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated tests are written for review and are never committed or promoted automatically.",
    "Locator strategy prefers roles, labels, placeholders, and visible text before selector fallbacks."
  ];
  const sourceFlowMapPath = flowMapArtifactPath ?? defaultProductFlowMapPath(target.id);

  if (!existsSync(join(rootDir, sourceFlowMapPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Flow map artifact not found at ${sourceFlowMapPath}. Run codedecay product --target ${target.id} --explore first.`,
      notes
    };
  }

  let flowMap: ProductFlowMap;
  try {
    flowMap = JSON.parse(readFileSync(join(rootDir, sourceFlowMapPath), "utf8")) as ProductFlowMap;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read flow map ${sourceFlowMapPath}: ${message}`,
      notes
    };
  }

  const impactedPaths = findImpactedProductPaths(rootDir);
  const tests = createGeneratedProductTestCases(flowMap, impactedPaths);
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "Flow map did not contain enough safe route, link, input, or form evidence to generate tests.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "product.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const source = renderGeneratedProductTestSource(flowMap, tests, sourceFlowMapPath);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl: flowMap.target.baseUrl
    },
    sourceFlowMapPath,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/e2e/codedecay-product.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes
  };
}

function loadGeneratedProductTestsForTarget(rootDir: string, target: CodeDecayProductTarget): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const manifestPath = defaultProductGeneratedTestManifestPath(target.id);
  const notes = [
    "Loaded existing generated tests without regenerating source.",
    "Review edits are preserved when using --run-generated-tests without --generate-tests."
  ];

  if (!existsSync(join(rootDir, manifestPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Generated test manifest not found at ${manifestPath}. Run codedecay product --target ${target.id} --generate-tests first.`,
      notes
    };
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), "utf8")) as ProductGeneratedTestManifest;
    if (!manifest.testSourcePath || !existsSync(join(rootDir, manifest.testSourcePath))) {
      return {
        status: "blocked",
        manifestPath,
        tests: manifest.tests ?? [],
        durationMs: elapsed(startedAt),
        error: `Generated test source not found at ${manifest.testSourcePath}. Run codedecay product --target ${target.id} --generate-tests first.`,
        notes
      };
    }

    return {
      status: "passed",
      sourcePath: manifest.testSourcePath,
      manifestPath,
      tests: manifest.tests ?? [],
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      manifestPath,
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read generated test manifest ${manifestPath}: ${message}`,
      notes
    };
  }
}

type ProductHttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

interface OpenApiDocument {
  openapi?: string | undefined;
  swagger?: string | undefined;
  servers?: Array<{ url?: string | undefined }> | undefined;
  paths?: Record<string, OpenApiPathItem | undefined> | undefined;
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[] | undefined;
  get?: OpenApiOperation | undefined;
  head?: OpenApiOperation | undefined;
  options?: OpenApiOperation | undefined;
  post?: OpenApiOperation | undefined;
  put?: OpenApiOperation | undefined;
  patch?: OpenApiOperation | undefined;
  delete?: OpenApiOperation | undefined;
}

interface OpenApiOperation {
  operationId?: string | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  parameters?: OpenApiParameter[] | undefined;
  requestBody?: OpenApiRequestBody | undefined;
  responses?: Record<string, unknown> | undefined;
}

interface OpenApiParameter {
  name?: string | undefined;
  in?: string | undefined;
  required?: boolean | undefined;
  schema?: OpenApiSchema | undefined;
  example?: unknown;
}

interface OpenApiRequestBody {
  content?: Record<string, { schema?: OpenApiSchema | undefined; example?: unknown } | undefined> | undefined;
  required?: boolean | undefined;
}

interface OpenApiSchema {
  type?: string | undefined;
  format?: string | undefined;
  enum?: unknown[] | undefined;
  default?: unknown;
  example?: unknown;
  properties?: Record<string, OpenApiSchema | undefined> | undefined;
  required?: string[] | undefined;
  items?: OpenApiSchema | undefined;
}

interface ResolvedOpenApiSchema {
  schemaPath: string;
  absolutePath: string;
  source: "configured" | "discovered";
}

const PRODUCT_API_METHODS: ProductHttpMethod[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
const SAFE_PRODUCT_API_METHODS = new Set<ProductHttpMethod>(["GET", "HEAD", "OPTIONS"]);

function generateProductApiTestsForTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult | undefined,
  allowDestructiveActions: boolean
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated API tests are written for review and are never committed or promoted automatically.",
    "OpenAPI request checks accept documented non-5xx statuses and fail unexpected server errors.",
    "Mutating API methods are generated as skipped review cases unless --allow-destructive-actions is passed."
  ];
  const schema = resolveProductOpenApiSchema(rootDir, loadedConfig);
  if (!schema.ok && target.apiEndpoints.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: schema.error,
      notes
    };
  }

  let document: OpenApiDocument | undefined;
  if (schema.ok) {
    try {
      document = YAML.parse(readFileSync(schema.schema.absolutePath, "utf8")) as OpenApiDocument;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "failed",
        tests: [],
        durationMs: elapsed(startedAt),
        error: `Could not read OpenAPI schema ${schema.schema.schemaPath}: ${message}`,
        notes
      };
    }

    if (!document || typeof document !== "object" || !document.paths || typeof document.paths !== "object") {
      return {
        status: "blocked",
        tests: [],
        durationMs: elapsed(startedAt),
        error: `OpenAPI schema ${schema.schema.schemaPath} does not contain a usable paths object.`,
        notes
      };
    }
  } else if (target.apiEndpoints.length > 0) {
    notes.push(schema.error);
  }

  const baseUrl = resolveProductApiBaseUrl(loadedConfig, target, health, document);
  if (!baseUrl) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "API test generation requires productTesting.targets.<id>.baseUrl, previewUrlEnv, toolAdapters.schemathesis.baseUrl, healthCheck, or an absolute OpenAPI servers[0].url.",
      notes
    };
  }

  const impactedPaths = findImpactedProductPaths(rootDir);
  const tests = [
    ...(document ? createGeneratedProductApiTestCases(document, baseUrl, impactedPaths) : []),
    ...createConfiguredProductApiTestCases(target.apiEndpoints, baseUrl, impactedPaths)
  ];
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: schema.ok
        ? `OpenAPI schema ${schema.schema.schemaPath} did not contain supported HTTP operations and no apiEndpoints are configured.`
        : "No supported configured apiEndpoints were found.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(target.id), "api.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const sourceLabel = schema.ok ? schema.schema.schemaPath : `productTesting.targets.${target.id}.apiEndpoints`;
  const source = renderGeneratedProductApiTestSource(target.id, baseUrl, sourceLabel, tests, allowDestructiveActions);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl
    },
    sourceOpenApiSchemaPath: schema.ok ? schema.schema.schemaPath : undefined,
    sourceApiEndpoints: target.apiEndpoints.length > 0 ? `productTesting.targets.${target.id}.apiEndpoints` : undefined,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/api/codedecay-api.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes: [
      ...notes,
      ...(schema.ok ? [`OpenAPI schema: ${schema.schema.schemaPath} (${schema.schema.source}).`] : []),
      ...(target.apiEndpoints.length > 0 ? [`Configured API endpoints: ${target.apiEndpoints.length}.`] : [])
    ]
  };
}

function loadGeneratedProductApiTestsForTarget(rootDir: string, target: CodeDecayProductTarget): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const manifestPath = defaultProductGeneratedApiTestManifestPath(target.id);
  const notes = [
    "Loaded existing generated API tests without regenerating source.",
    "Review edits are preserved when using --run-generated-api-tests without --generate-api-tests."
  ];

  if (!existsSync(join(rootDir, manifestPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Generated API test manifest not found at ${manifestPath}. Run codedecay product --target ${target.id} --generate-api-tests first.`,
      notes
    };
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), "utf8")) as ProductGeneratedTestManifest;
    if (!manifest.testSourcePath || !existsSync(join(rootDir, manifest.testSourcePath))) {
      return {
        status: "blocked",
        manifestPath,
        tests: manifest.tests ?? [],
        durationMs: elapsed(startedAt),
        error: `Generated API test source not found at ${manifest.testSourcePath}. Run codedecay product --target ${target.id} --generate-api-tests first.`,
        notes
      };
    }

    return {
      status: "passed",
      sourcePath: manifest.testSourcePath,
      manifestPath,
      tests: manifest.tests ?? [],
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      manifestPath,
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read generated API test manifest ${manifestPath}: ${message}`,
      notes
    };
  }
}

function resolveProductOpenApiSchema(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): { ok: true; schema: ResolvedOpenApiSchema } | { ok: false; error: string } {
  const configured = loadedConfig.config.toolAdapters.schemathesis?.schema;
  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return {
        ok: false,
        error: "HTTP(S) OpenAPI schema URLs are not fetched by codedecay product yet. Provide a local toolAdapters.schemathesis.schema file for local-first generation."
      };
    }

    const absolutePath = resolve(rootDir, configured);
    if (!existsSync(absolutePath)) {
      return {
        ok: false,
        error: `Configured OpenAPI schema not found at ${configured}.`
      };
    }

    return {
      ok: true,
      schema: {
        schemaPath: relativePathForArtifact(rootDir, absolutePath),
        absolutePath,
        source: "configured"
      }
    };
  }

  for (const candidate of [
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "docs/openapi.yaml",
    "docs/openapi.yml",
    "docs/openapi.json",
    "api/openapi.yaml",
    "api/openapi.yml",
    "api/openapi.json"
  ]) {
    const absolutePath = resolve(rootDir, candidate);
    if (existsSync(absolutePath)) {
      return {
        ok: true,
        schema: {
          schemaPath: candidate,
          absolutePath,
          source: "discovered"
        }
      };
    }
  }

  return {
    ok: false,
    error: "No OpenAPI schema found. Set toolAdapters.schemathesis.schema or add openapi.yaml, openapi.json, docs/openapi.yaml, or api/openapi.yaml."
  };
}

function resolveProductApiBaseUrl(
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult | undefined,
  document: OpenApiDocument | undefined
): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl ?? loadedConfig.config.toolAdapters.schemathesis?.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  if (health?.url) {
    const resolved = resolveMaybeUrl(health.url, health.url);
    if (resolved) {
      return new URL(resolved).origin;
    }
  }

  const serverUrl = document?.servers?.find((server) => typeof server.url === "string" && /^https?:\/\//i.test(server.url))?.url;
  return serverUrl ? normalizeExploreUrl(serverUrl) : undefined;
}

function createGeneratedProductApiTestCases(
  document: OpenApiDocument,
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();
  const paths = document.paths ?? {};

  for (const path of Object.keys(paths).sort((left, right) => left.localeCompare(right))) {
    const pathItem = paths[path];
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of PRODUCT_API_METHODS) {
      const operation = pathItem[method.toLowerCase() as Lowercase<ProductHttpMethod>];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const operationPath = sampleOpenApiOperationPath(path, pathItem, operation);
      const expectedStatuses = openApiExpectedStatuses(operation);
      const destructive = !SAFE_PRODUCT_API_METHODS.has(method);
      const id = generatedTestId("api", method, path, operation.operationId ?? "");
      addGeneratedTestCase(tests, seen, {
        id,
        title: `${method} ${path} returns a documented status`,
        kind: "api-operation",
        pageUrl: new URL(operationPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
        method,
        operationPath,
        operationId: operation.operationId,
        expectedStatuses,
        requestBody: destructive ? sampleOpenApiRequestBody(operation) : undefined,
        destructive,
        priority: priorityForPath(path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function createConfiguredProductApiTestCases(
  endpoints: CodeDecayProductApiEndpoint[],
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();

  for (const endpoint of endpoints) {
    const destructive = !SAFE_PRODUCT_API_METHODS.has(endpoint.method);
    const id = endpoint.id ?? generatedTestId("api", "configured", endpoint.method, endpoint.path);
    addGeneratedTestCase(tests, seen, {
      id,
      title: `${endpoint.method} ${endpoint.path} returns a configured status`,
      kind: "api-operation",
      pageUrl: new URL(endpoint.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
      method: endpoint.method,
      operationPath: endpoint.path,
      expectedStatuses: endpoint.expectedStatuses,
      headers: endpoint.headers,
      requestBody: endpoint.body,
      destructive,
      priority: priorityForPath(endpoint.path, impactedPaths)
    });
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function renderGeneratedProductApiTestSource(
  targetId: string,
  baseUrl: string,
  sourceSchemaPath: string,
  tests: ProductGeneratedTestCase[],
  allowDestructiveActions: boolean
): string {
  const lines = [
    "import { test } from '@playwright/test';",
    "",
    "// @generated by CodeDecay. Review before promoting into your permanent test suite.",
    `// codedecay:source-openapi-schema=${sourceSchemaPath}`,
    `// codedecay:target=${targetId}`,
    "",
    `const CODEDECAY_API_BASE_URL = process.env.CODEDECAY_PRODUCT_BASE_URL ?? ${JSON.stringify(baseUrl)};`,
    "",
    "function apiUrl(path: string): string {",
    "  return new URL(path, CODEDECAY_API_BASE_URL.endsWith('/') ? CODEDECAY_API_BASE_URL : `${CODEDECAY_API_BASE_URL}/`).toString();",
    "}",
    "",
    "async function responseSnippet(response: { text: () => Promise<string> }): Promise<string> {",
    "  try {",
    "    return (await response.text()).replace(/\\s+/g, ' ').trim().slice(0, 500);",
    "  } catch {",
    "    return '';",
    "  }",
    "}",
    "",
    `test.describe(${JSON.stringify(`CodeDecay generated API regression tests (${targetId})`)}, () => {`
  ];

  for (const testCase of tests) {
    const declaration = testCase.destructive && !allowDestructiveActions ? "test.skip" : "test";
    lines.push(
      "",
      `  ${declaration}(${JSON.stringify(testCase.title)}, async ({ request }) => {`,
      `    test.info().annotations.push({ type: 'codedecay.testId', description: ${JSON.stringify(testCase.id)} });`
    );
    appendGeneratedApiTestBody(lines, testCase);
    lines.push("  });");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function appendGeneratedApiTestBody(lines: string[], testCase: ProductGeneratedTestCase): void {
  const method = testCase.method ?? "GET";
  const operationPath = testCase.operationPath ?? new URL(testCase.pageUrl).pathname;
  const expectedStatuses = testCase.expectedStatuses ?? [];
  const requestBody = testCase.requestBody;
  const headers =
    requestBody === undefined
      ? { accept: "application/json", ...(testCase.headers ?? {}) }
      : { accept: "application/json", "content-type": "application/json", ...(testCase.headers ?? {}) };
  lines.push("    const response = await request.fetch(");
  lines.push(`      apiUrl(${JSON.stringify(operationPath)}),`);
  lines.push("      {");
  lines.push(`        method: ${JSON.stringify(method)},`);
  lines.push(`        headers: ${JSON.stringify(headers)}${requestBody === undefined ? "" : ","}`);
  if (requestBody !== undefined) {
    lines.push(`        data: ${JSON.stringify(requestBody, null, 10).replace(/\n/g, "\n        ")}`);
  }
  lines.push("      }");
  lines.push("    );");
  lines.push("    const status = response.status();");
  if (expectedStatuses.length > 0) {
    lines.push(`    const expectedStatuses = ${JSON.stringify(expectedStatuses)};`);
    lines.push("    if (!expectedStatuses.includes(status)) {");
    lines.push("      throw new Error(`Expected documented status ${expectedStatuses.join(', ')} but got ${status}. Body: ${await responseSnippet(response)}`);");
    lines.push("    }");
  } else {
    lines.push("    if (status >= 500) {");
    lines.push("      throw new Error(`Expected a non-5xx API response but got ${status}. Body: ${await responseSnippet(response)}`);");
    lines.push("    }");
  }
}

function sampleOpenApiRequestBody(operation: OpenApiOperation): unknown {
  const content = operation.requestBody?.content;
  const jsonMedia = content?.["application/json"] ?? content?.["application/problem+json"] ?? Object.values(content ?? {}).find(Boolean);
  if (!jsonMedia) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (jsonMedia.example !== undefined) {
    return jsonMedia.example;
  }

  return sampleOpenApiSchemaValue(jsonMedia.schema);
}

function sampleOpenApiSchemaValue(schema: OpenApiSchema | undefined): unknown {
  if (!schema) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (schema.type === "array") {
    return [sampleOpenApiSchemaValue(schema.items)];
  }

  if (schema.type === "integer" || schema.type === "number") {
    return 1;
  }

  if (schema.type === "boolean") {
    return true;
  }

  if (schema.type === "string") {
    if (schema.format === "email") {
      return "codedecay@example.com";
    }

    if (schema.format === "uri" || schema.format === "url") {
      return "https://example.com";
    }

    if (schema.format === "uuid") {
      return "00000000-0000-4000-8000-000000000001";
    }

    return "codedecay";
  }

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? Object.keys(properties));
  const value: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (!required.has(name)) {
      continue;
    }

    value[name] = sampleOpenApiSchemaValue(property);
  }

  return Object.keys(value).length > 0 ? value : { codedecay: "review-before-running" };
}

function sampleOpenApiOperationPath(path: string, pathItem: OpenApiPathItem, operation: OpenApiOperation): string {
  const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const replacedPath = path.replace(/\{([^}]+)\}/g, (_match, name: string) => encodeURIComponent(String(sampleOpenApiParameterValue(name, parameters))));
  const query = new URLSearchParams();

  for (const parameter of parameters) {
    if (parameter.in !== "query" || !parameter.name || parameter.required !== true) {
      continue;
    }

    query.set(parameter.name, String(sampleOpenApiParameterValue(parameter.name, parameters)));
  }

  const queryString = query.toString();
  return queryString ? `${replacedPath}?${queryString}` : replacedPath;
}

function sampleOpenApiParameterValue(name: string, parameters: OpenApiParameter[]): string | number | boolean {
  const parameter = parameters.find((candidate) => candidate.name === name);
  const schema = parameter?.schema;
  const lowerName = name.toLowerCase();

  if (parameter?.example !== undefined) {
    return primitiveSampleValue(parameter.example);
  }

  if (schema?.example !== undefined) {
    return primitiveSampleValue(schema.example);
  }

  if (schema?.default !== undefined) {
    return primitiveSampleValue(schema.default);
  }

  if (Array.isArray(schema?.enum) && schema.enum.length > 0) {
    return primitiveSampleValue(schema.enum[0]);
  }

  if (schema?.type === "integer" || schema?.type === "number" || /\b(id|count|page|limit|offset)\b/i.test(lowerName)) {
    return 1;
  }

  if (schema?.type === "boolean") {
    return true;
  }

  if (schema?.format === "email" || lowerName.includes("email")) {
    return "codedecay@example.com";
  }

  if (schema?.format === "uuid" || lowerName.includes("uuid")) {
    return "00000000-0000-4000-8000-000000000001";
  }

  return "codedecay";
}

function primitiveSampleValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return "codedecay";
  }

  return JSON.stringify(value);
}

function openApiExpectedStatuses(operation: OpenApiOperation): number[] {
  return Object.keys(operation.responses ?? {})
    .filter((status) => /^\d{3}$/.test(status))
    .map((status) => Number(status))
    .filter((status) => status >= 100 && status < 500)
    .sort((left, right) => left - right);
}

async function runGeneratedProductTests(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  generatedTests: ProductGeneratedTestsResult,
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests"
): Promise<ProductGeneratedTestRunResult> {
  const startedAt = Date.now();
  const notes = [
    "Generated tests run only from the local generated-tests artifact path.",
    "Use the rerun command after reviewing or editing the generated test source."
  ];

  if (!generatedTests.sourcePath || generatedTests.tests.length === 0) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: "",
      error: "Generated test source is missing; run --generate-tests first.",
      notes
    };
  }

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: "Generated test execution is disabled by config safety.allowCommands.",
      error: "Generated test execution requires safety.allowCommands to be true.",
      notes
    };
  }

  const command = resolveProjectPlaywrightTestCommand(rootDir, generatedTests.sourcePath);
  if (!command.ok) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: command.error,
      error: command.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install packages or browsers."]
    };
  }

  const execution = await runConfiguredCommand({
    command: command.command,
    cwd: rootDir,
    timeoutMs: target.timeoutMs,
    env: {
      CODEDECAY_PRODUCT_BASE_URL: generatedProductBaseUrl(rootDir, generatedTests)
    },
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
  const testSource = readFileSync(join(rootDir, generatedTests.sourcePath), "utf8");
  const parsed = parsePlaywrightTestRun({
    stdout: execution.stdout,
    generatedTests,
    testSource,
    target,
    rootDir,
    rerunFlag
  });
  const failed = parsed.failed > 0 || execution.status !== "passed";
  const fallbackFailures =
    failed && parsed.failures.length === 0
      ? [
          createGeneratedTestFailure({
            title: "Generated Playwright command",
            failingStep: "Run generated Playwright regression tests.",
            error: execution.error ?? (execution.stderr.trim() || `Playwright command exited with status ${execution.status}.`),
            generatedTests,
            testSource,
            target,
            rootDir,
            rerunFlag
          })
        ]
      : parsed.failures;

  return {
    status: failed ? "failed" : "passed",
    command: command.command,
    durationMs: elapsed(startedAt),
    passed: parsed.passed,
    failed: failed ? Math.max(parsed.failed, fallbackFailures.length) : parsed.failed,
    skipped: parsed.skipped,
    failures: fallbackFailures,
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    error: failed ? execution.error : undefined,
    notes
  };
}

function createGeneratedProductTestCases(flowMap: ProductFlowMap, impactedPaths: Set<string>): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const pages = [...flowMap.pages].sort((left, right) => left.depth - right.depth || left.url.localeCompare(right.url));
  const seen = new Set<string>();

  for (const page of pages) {
    addGeneratedTestCase(tests, seen, {
      id: generatedTestId("route", page.path),
      title: `loads ${page.path || "/"}`,
      kind: "route-load",
      pageUrl: page.url,
      priority: priorityForPath(page.path, impactedPaths)
    });
  }

  for (const page of pages) {
    const links = page.links
      .filter((link) => link.sameOrigin && link.discovered && link.text.trim().length > 0)
      .sort((left, right) => left.href.localeCompare(right.href));

    for (const link of links) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("link", page.path, new URL(link.href).pathname, link.text),
        title: `navigates from ${page.path || "/"} to ${new URL(link.href).pathname || "/"} via ${link.text}`,
        kind: "link-navigation",
        pageUrl: page.url,
        selector: link.selector,
        targetUrl: link.href,
        priority: priorityForPath(new URL(link.href).pathname, impactedPaths)
      });
    }
  }

  for (const page of pages) {
    const inputs = page.interactiveElements
      .filter((element) => element.kind === "input" && !element.blocked && safeInputType(element.inputType))
      .sort((left, right) => left.selector.localeCompare(right.selector));

    for (const input of inputs) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("input", page.path, input.name, input.selector),
        title: `fills ${input.name} on ${page.path || "/"}`,
        kind: "input-state",
        pageUrl: page.url,
        selector: input.selector,
        priority: priorityForPath(page.path, impactedPaths)
      });
    }
  }

  for (const page of pages) {
    const forms = page.interactiveElements
      .filter((element) => element.kind === "form" && !element.blocked)
      .sort((left, right) => left.selector.localeCompare(right.selector));

    for (const form of forms) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("form", page.path, form.name, form.selector),
        title: `shows safe form ${form.name} on ${page.path || "/"}`,
        kind: "form-visibility",
        pageUrl: page.url,
        selector: form.selector,
        priority: priorityForPath(page.path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function addGeneratedTestCase(tests: ProductGeneratedTestCase[], seen: Set<string>, test: ProductGeneratedTestCase): void {
  if (seen.has(test.id)) {
    return;
  }

  seen.add(test.id);
  tests.push(test);
}

function renderGeneratedProductTestSource(flowMap: ProductFlowMap, tests: ProductGeneratedTestCase[], sourceFlowMapPath: string): string {
  const lines = [
    "import { test, expect } from '@playwright/test';",
    "",
    "// @generated by CodeDecay. Review before promoting into your permanent test suite.",
    `// codedecay:source-flow-map=${sourceFlowMapPath}`,
    `// codedecay:target=${flowMap.target.id}`,
    "",
    `const CODEDECAY_BASE_URL = process.env.CODEDECAY_PRODUCT_BASE_URL ?? ${JSON.stringify(flowMap.target.baseUrl)};`,
    "",
    "function productUrl(path: string): string {",
    "  return new URL(path, CODEDECAY_BASE_URL.endsWith('/') ? CODEDECAY_BASE_URL : `${CODEDECAY_BASE_URL}/`).toString();",
    "}",
    "",
    `test.describe(${JSON.stringify(`CodeDecay generated product regression tests (${flowMap.target.id})`)}, () => {`
  ];

  for (const testCase of tests) {
    lines.push("", `  test(${JSON.stringify(testCase.title)}, async ({ page }) => {`, `    test.info().annotations.push({ type: 'codedecay.testId', description: ${JSON.stringify(testCase.id)} });`);
    appendGeneratedTestBody(lines, testCase, flowMap);
    lines.push("  });");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function appendGeneratedTestBody(lines: string[], testCase: ProductGeneratedTestCase, flowMap: ProductFlowMap): void {
  const page = findFlowPageForTest(flowMap, testCase.pageUrl);
  const pagePath = new URL(testCase.pageUrl).pathname || "/";

  if (testCase.kind === "route-load") {
    lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
    lines.push("    await expect(page.locator('body')).toBeVisible();");
    if (page?.title) {
      lines.push(`    await expect(page).toHaveTitle(${regexLiteralForText(page.title)});`);
    }
    return;
  }

  if (testCase.kind === "link-navigation") {
    const link = page?.links.find((candidate) => candidate.href === testCase.targetUrl || candidate.selector === testCase.selector);
    lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
    lines.push(`    await ${locatorForInteractiveElement("link", link?.text ?? testCase.title, testCase.selector)}.click();`);
    lines.push(`    await expect(page).toHaveURL(productUrl(${JSON.stringify(new URL(testCase.targetUrl ?? testCase.pageUrl).pathname || "/")}));`);
    return;
  }

  if (testCase.kind === "input-state") {
    const element = page?.interactiveElements.find((candidate) => candidate.selector === testCase.selector);
    const sampleValue = sampleValueForInput(element?.inputType, element?.name);
    lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
    lines.push(`    const field = ${locatorForInteractiveElement("input", element?.name ?? testCase.title, testCase.selector)};`);
    lines.push(`    await field.fill(${JSON.stringify(sampleValue)});`);
    lines.push(`    await expect(field).toHaveValue(${JSON.stringify(sampleValue)});`);
    return;
  }

  const element = page?.interactiveElements.find((candidate) => candidate.selector === testCase.selector);
  lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
  lines.push(`    await expect(${locatorForInteractiveElement("form", element?.name ?? testCase.title, testCase.selector)}).toBeVisible();`);
}

function locatorForInteractiveElement(kind: "link" | "input" | "form", name: string, selector: string | undefined): string {
  const safeName = normalizeWhitespace(name);
  const fallback = selector ? `.or(page.locator(${JSON.stringify(selector)}))` : "";
  if (kind === "link") {
    return `page.getByRole('link', { name: ${regexLiteralForText(safeName)} }).first()${fallback}`;
  }

  if (kind === "input") {
    return `page.getByLabel(${regexLiteralForText(safeName)}).or(page.getByPlaceholder(${regexLiteralForText(safeName)}))${fallback}.first()`;
  }

  return selector ? `page.locator(${JSON.stringify(selector)}).first()` : `page.getByRole('form', { name: ${regexLiteralForText(safeName)} }).first()`;
}

function findFlowPageForTest(flowMap: ProductFlowMap, url: string): ProductFlowPage | undefined {
  return flowMap.pages.find((page) => page.url === url);
}

function resolveProjectPlaywrightTestCommand(
  rootDir: string,
  sourcePath: string
): { ok: true; command: string } | { ok: false; error: string } {
  const absoluteSourcePath = join(rootDir, sourcePath);
  const candidates = [
    join(rootDir, "node_modules", "playwright", "cli.js"),
    join(rootDir, "node_modules", "@playwright", "test", "cli.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        ok: true,
        command: `${shellQuote(process.execPath)} ${shellQuote(candidate)} test ${shellQuote(absoluteSourcePath)} --reporter=json`
      };
    }
  }

  const bin = join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
  if (existsSync(bin)) {
    return {
      ok: true,
      command: `${shellQuote(bin)} test ${shellQuote(absoluteSourcePath)} --reporter=json`
    };
  }

  return {
    ok: false,
    error: "Could not find a project-local Playwright CLI in node_modules/playwright, node_modules/@playwright/test, or node_modules/.bin."
  };
}

function parsePlaywrightTestRun(input: {
  stdout: string;
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
}): { passed: number; failed: number; skipped: number; failures: ProductGeneratedTestFailure[] } {
  const parsed = parseJsonFromOutput(input.stdout);
  if (!parsed || typeof parsed !== "object") {
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  const specs = collectPlaywrightSpecs(parsed);
  if (specs.length === 0) {
    return {
      passed: input.generatedTests.tests.length,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: ProductGeneratedTestFailure[] = [];

  for (const spec of specs) {
    const title = typeof spec.title === "string" ? spec.title : "Generated Playwright test";
    const matchingTest = input.generatedTests.tests.find((test) => test.title === title || title.includes(test.title));
    const testEntries = Array.isArray(spec.tests) ? spec.tests : [];
    const resultEntries = testEntries.flatMap((testEntry) => (Array.isArray(testEntry.results) ? testEntry.results : []));
    const statuses = resultEntries.map((result) => String(result.status ?? "")).filter(Boolean);
    const hasFailure = statuses.some((status) => ["failed", "timedOut", "interrupted"].includes(status)) || spec.ok === false;
    const hasSkip = statuses.some((status) => status === "skipped") || testEntries.some((testEntry) => testEntry.status === "skipped");

    if (hasFailure) {
      failed += 1;
      const firstFailedResult = resultEntries.find((result) => ["failed", "timedOut", "interrupted"].includes(String(result.status ?? "")));
      failures.push(
        createGeneratedTestFailure({
          testId: matchingTest?.id,
          title,
          failingStep: `Run generated test "${title}".`,
          error: extractPlaywrightError(firstFailedResult) ?? extractPlaywrightError(spec) ?? "Generated Playwright test failed.",
          generatedTests: input.generatedTests,
          testSource: input.testSource,
          target: input.target,
          rootDir: input.rootDir,
          rerunFlag: input.rerunFlag
        })
      );
    } else if (hasSkip) {
      skipped += 1;
    } else {
      passed += 1;
    }
  }

  return {
    passed,
    failed,
    skipped,
    failures
  };
}

function collectPlaywrightSpecs(value: unknown): Array<Record<string, any>> {
  const specs: Array<Record<string, any>> = [];
  visit(value);
  return specs;

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, any>;
    if (Array.isArray(record.tests) && typeof record.title === "string") {
      specs.push(record);
    }

    for (const key of ["suites", "specs", "children"]) {
      if (Array.isArray(record[key])) {
        for (const child of record[key]) {
          visit(child);
        }
      }
    }
  }
}

function createGeneratedTestFailure(input: {
  testId?: string | undefined;
  title: string;
  failingStep: string;
  error: string;
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
}): ProductGeneratedTestFailure {
  const testCase =
    input.testId !== undefined
      ? input.generatedTests.tests.find((candidate) => candidate.id === input.testId)
      : input.generatedTests.tests.find((candidate) => candidate.title === input.title || input.title.includes(candidate.title));
  const impactedFiles = findImpactedProductFiles(input.rootDir);
  return {
    testId: input.testId,
    title: input.title,
    failingStep: input.failingStep,
    error: input.error,
    request:
      testCase?.method && testCase.operationPath
        ? {
            method: testCase.method,
            url: testCase.pageUrl
          }
        : undefined,
    expected: expectedGeneratedTestBehavior(testCase),
    actual: input.error,
    impactedFiles: impactedFiles.length > 0 ? impactedFiles : undefined,
    testSourcePath: input.generatedTests.sourcePath ?? "",
    testSource: input.testSource,
    rerunCommand: `npx codedecay product --target ${input.target.id} ${input.rerunFlag} --format markdown`
  };
}

function parseJsonFromOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return undefined;
    }
  }
}

function extractPlaywrightError(value: any): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (typeof value.error?.message === "string") {
    return value.error.message;
  }

  if (Array.isArray(value.errors) && typeof value.errors[0]?.message === "string") {
    return value.errors[0].message;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  return undefined;
}

function generatedProductBaseUrl(rootDir: string, generatedTests: ProductGeneratedTestsResult): string | undefined {
  if (!generatedTests.manifestPath || !existsSync(join(rootDir, generatedTests.manifestPath))) {
    return undefined;
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, generatedTests.manifestPath), "utf8")) as ProductGeneratedTestManifest;
    return manifest.target.baseUrl;
  } catch {
    return undefined;
  }
}

function defaultProductFlowMapPath(targetId: string): string {
  return join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(targetId), "flow-map.json");
}

function defaultProductGeneratedTestManifestPath(targetId: string): string {
  return join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(targetId), "manifest.json");
}

function defaultProductGeneratedApiTestManifestPath(targetId: string): string {
  return join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(targetId), "manifest.json");
}

function findImpactedProductPaths(rootDir: string): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = createAnalysisContextForCli(repoRoot, { format: "markdown" });
    return new Set((analysis.report.impactedRoutes ?? []).map((route) => route.route));
  } catch {
    return new Set();
  }
}

function findImpactedProductFiles(rootDir: string): string[] {
  try {
    const repoRoot = getRepoRoot(rootDir);
    return getChangedFilesForCli(repoRoot, { format: "markdown" }).map((change) => change.path).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function expectedGeneratedTestBehavior(testCase: ProductGeneratedTestCase | undefined): string | undefined {
  if (!testCase) {
    return undefined;
  }

  if (testCase.kind === "api-operation") {
    const statusText =
      testCase.expectedStatuses && testCase.expectedStatuses.length > 0
        ? `one of the documented statuses ${testCase.expectedStatuses.join(", ")}`
        : "a non-5xx response";
    return `${testCase.method ?? "GET"} ${testCase.operationPath ?? testCase.pageUrl} should return ${statusText}.`;
  }

  return `${testCase.title} should pass in the generated product regression suite.`;
}

function relativePathForArtifact(rootDir: string, absolutePath: string): string {
  const artifactPath = relative(rootDir, absolutePath);
  return artifactPath && !artifactPath.startsWith("..") ? artifactPath : absolutePath;
}

function priorityForPath(path: string, impactedPaths: Set<string>): ProductGeneratedTestCase["priority"] {
  return impactedPaths.has(path) ? "high" : "medium";
}

function priorityRank(priority: ProductGeneratedTestCase["priority"]): number {
  if (priority === "high") {
    return 0;
  }

  if (priority === "medium") {
    return 1;
  }

  return 2;
}

function safeInputType(inputType: string | undefined): boolean {
  return ["text", "email", "search", "tel", "url", "password", undefined].includes(inputType);
}

function sampleValueForInput(inputType: string | undefined, name: string | undefined): string {
  const normalized = `${inputType ?? ""} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("email")) {
    return "codedecay@example.com";
  }

  if (normalized.includes("phone") || normalized.includes("tel")) {
    return "5550100";
  }

  if (normalized.includes("url")) {
    return "https://example.com";
  }

  if (normalized.includes("password")) {
    return "CodeDecayTest123!";
  }

  return "CodeDecay test";
}

function generatedTestId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function regexLiteralForText(value: string): string {
  const escaped = normalizeWhitespace(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  return `/${escaped}/i`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function createProductTargetSummary(results: ProductTargetResult[], durationMs: number): ProductTargetSummary {
  const passed = countProductStatus(results, "passed");
  const failed = countProductStatus(results, "failed");
  const skipped = countProductStatus(results, "skipped");
  const blocked = countProductStatus(results, "blocked");
  const timedOut = countProductStatus(results, "timed_out");

  return {
    status: productTargetStatus(results, { failed, blocked, timedOut }),
    total: results.length,
    ready: results.filter((result) => result.readiness.status === "ready" || result.readiness.status === "command-required").length,
    passed,
    failed,
    skipped,
    blocked,
    timedOut,
    durationMs
  };
}

function productTargetStatus(
  results: ProductTargetResult[],
  counts: Pick<ProductTargetSummary, "failed" | "blocked" | "timedOut">
): ProductTargetStatus {
  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.blocked > 0) {
    return "blocked";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function countProductStatus(results: ProductTargetResult[], status: ProductTargetStatus): number {
  return results.filter((result) => result.status === status).length;
}

function productStatusFromRequiredCommand(status: ExecutionStatus): ProductTargetStatus {
  if (status === "passed") {
    return "passed";
  }

  if (status === "timed_out") {
    return "timed_out";
  }

  if (status === "skipped" || status === "blocked") {
    return "blocked";
  }

  return "failed";
}

function commandActuallyExecuted(result: CommandExecutionResult | undefined): boolean {
  return result !== undefined && result.status !== "skipped" && result.status !== "blocked";
}

function isProductTargetFailure(status: ProductTargetStatus): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out";
}

function renderProductTargetReport(report: ProductTargetReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderProductTargetMarkdown(report);
}

function renderProductTargetMarkdown(report: ProductTargetReport): string {
  const lines = [
    "## CodeDecay Product Target Report",
    "",
    `**Overall status:** ${formatProductStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Ready | ${report.summary.ready} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Blocked | ${report.summary.blocked} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.targets.length === 0) {
    lines.push("No product testing targets configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Targets", "");
  for (const target of report.targets) {
    lines.push(`- **${target.id}** ${formatProductStatus(target.status)} in ${target.durationMs}ms`);
    lines.push(`  - Readiness: ${target.readiness.status} (${target.readiness.mode})`);
    lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
    lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);

    if (target.setup) {
      lines.push(`  - Setup: ${formatCommandExecutionStatus(target.setup.status)} \`${target.setup.command}\``);
      appendOutputBlock(lines, "setup stdout", target.setup.stdout);
      appendOutputBlock(lines, "setup stderr", target.setup.stderr);
    }

    if (target.start) {
      lines.push(`  - Start: ${formatProductStartStatus(target.start.status)} \`${target.start.command}\``);
      if (target.start.error) {
        lines.push(`  - Start error: ${target.start.error}`);
      }
      appendOutputBlock(lines, "start stdout", target.start.stdout);
      appendOutputBlock(lines, "start stderr", target.start.stderr);
    }

    if (target.health) {
      lines.push(
        `  - Health: ${formatProductStatus(target.health.status)} after ${target.health.attempts} attempt(s) at \`${target.health.url}\``
      );
      if (target.health.httpStatus !== undefined) {
        lines.push(`  - HTTP status: ${target.health.httpStatus}`);
      }
      if (target.health.error) {
        lines.push(`  - Health error: ${target.health.error}`);
      }
    }

    if (target.exploration) {
      lines.push(`  - Exploration: ${formatProductStatus(target.exploration.status)} using ${target.exploration.driver}`);
      lines.push(`  - Flow pages: ${target.exploration.pages}`);
      lines.push(`  - Interactive elements: ${target.exploration.interactiveElements}`);
      lines.push(`  - Blocked actions: ${target.exploration.blockedActions}`);
      lines.push(`  - Skipped actions: ${target.exploration.skippedActions}`);
      if (target.exploration.artifactPath) {
        lines.push(`  - Flow map: \`${target.exploration.artifactPath}\``);
      }
      if (target.exploration.error) {
        lines.push(`  - Exploration error: ${target.exploration.error}`);
      }
      for (const note of target.exploration.notes) {
        lines.push(`  - Exploration note: ${note}`);
      }
    }

    if (target.generatedTests) {
      lines.push(`  - Generated tests: ${formatProductStatus(target.generatedTests.status)} (${target.generatedTests.tests.length} test(s))`);
      if (target.generatedTests.sourcePath) {
        lines.push(`  - Generated test source: \`${target.generatedTests.sourcePath}\``);
      }
      if (target.generatedTests.manifestPath) {
        lines.push(`  - Generated test manifest: \`${target.generatedTests.manifestPath}\``);
      }
      if (target.generatedTests.error) {
        lines.push(`  - Generated test error: ${target.generatedTests.error}`);
      }
      for (const generatedTest of target.generatedTests.tests.slice(0, 8)) {
        lines.push(`  - Test: ${generatedTest.priority} ${generatedTest.kind} \`${generatedTest.id}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedTests.notes) {
        lines.push(`  - Generated test note: ${note}`);
      }
    }

    if (target.generatedTestRun) {
      lines.push(`  - Generated test run: ${formatProductStatus(target.generatedTestRun.status)}`);
      if (target.generatedTestRun.command) {
        lines.push(`  - Generated test command: \`${target.generatedTestRun.command}\``);
      }
      lines.push(`  - Generated test results: ${target.generatedTestRun.passed} passed, ${target.generatedTestRun.failed} failed, ${target.generatedTestRun.skipped} skipped`);
      if (target.generatedTestRun.error) {
        lines.push(`  - Generated test run error: ${target.generatedTestRun.error}`);
      }
      for (const failure of target.generatedTestRun.failures) {
        lines.push(`  - Failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedTestRun.notes) {
        lines.push(`  - Generated test run note: ${note}`);
      }
    }

    if (target.generatedApiTests) {
      lines.push(`  - Generated API tests: ${formatProductStatus(target.generatedApiTests.status)} (${target.generatedApiTests.tests.length} test(s))`);
      if (target.generatedApiTests.sourcePath) {
        lines.push(`  - Generated API test source: \`${target.generatedApiTests.sourcePath}\``);
      }
      if (target.generatedApiTests.manifestPath) {
        lines.push(`  - Generated API test manifest: \`${target.generatedApiTests.manifestPath}\``);
      }
      if (target.generatedApiTests.error) {
        lines.push(`  - Generated API test error: ${target.generatedApiTests.error}`);
      }
      for (const generatedTest of target.generatedApiTests.tests.slice(0, 8)) {
        const method = generatedTest.method ? `${generatedTest.method} ` : "";
        lines.push(`  - API test: ${generatedTest.priority} ${method}\`${generatedTest.operationPath ?? generatedTest.pageUrl}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedApiTests.notes) {
        lines.push(`  - Generated API test note: ${note}`);
      }
    }

    if (target.generatedApiTestRun) {
      lines.push(`  - Generated API test run: ${formatProductStatus(target.generatedApiTestRun.status)}`);
      if (target.generatedApiTestRun.command) {
        lines.push(`  - Generated API test command: \`${target.generatedApiTestRun.command}\``);
      }
      lines.push(`  - Generated API test results: ${target.generatedApiTestRun.passed} passed, ${target.generatedApiTestRun.failed} failed, ${target.generatedApiTestRun.skipped} skipped`);
      if (target.generatedApiTestRun.error) {
        lines.push(`  - Generated API test run error: ${target.generatedApiTestRun.error}`);
      }
      for (const failure of target.generatedApiTestRun.failures) {
        lines.push(`  - API failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedApiTestRun.notes) {
        lines.push(`  - Generated API test run note: ${note}`);
      }
    }

    if (target.teardown) {
      lines.push(`  - Teardown: ${formatCommandExecutionStatus(target.teardown.status)} \`${target.teardown.command}\``);
      appendOutputBlock(lines, "teardown stdout", target.teardown.stdout);
      appendOutputBlock(lines, "teardown stderr", target.teardown.stderr);
    }

    for (const note of target.notes) {
      lines.push(`  - Note: ${note}`);
    }
  }

  lines.push(
    "",
    "### Safety",
    "",
    `- Commands executed: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- Browser automation ran: ${report.safety.browserAutomationRan ? "yes" : "no"}`,
    `- Generated tests ran: ${report.safety.generatedTestsRan ? "yes" : "no"}`,
    `- Startup commands allowed: ${report.safety.startupCommandsAllowed ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    ""
  );

  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function formatProductStatus(status: ProductTargetStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatCommandExecutionStatus(status: ExecutionStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatProductStartStatus(status: ProductStartResult["status"]): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function appendLimitedOutput(existing: string, next: string, limit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= limit) {
    return combined;
  }

  return combined.slice(combined.length - limit);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
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

  lines.push("### Product Testing Targets", "");
  appendConfigProductTargets(lines, config.productTesting.targets);

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
    "reportPath" in adapter && adapter.reportPath ? `reportPath: \`${adapter.reportPath}\`` : undefined,
    "schema" in adapter && adapter.schema ? `schema: \`${adapter.schema}\`` : undefined,
    "baseUrl" in adapter && adapter.baseUrl ? `baseUrl: \`${adapter.baseUrl}\`` : undefined
  ]
    .filter((item): item is string => item !== undefined)
    .join("<br>");

  return `| ${name} | ${adapter.enabled ? "yes" : "no"} | ${details} | ${adapter.timeoutMs ? `${adapter.timeoutMs}ms` : "default"} |`;
}

function appendConfigProductTargets(
  lines: string[],
  targets: LoadedCodeDecayConfig["config"]["productTesting"]["targets"]
): void {
  const entries = Object.values(targets);
  if (entries.length === 0) {
    lines.push("No product testing targets configured.", "");
    return;
  }

  lines.push(
    "| Target | Readiness | Effective URL | Commands | Health check | API endpoints | Timeout |",
    "| --- | --- | --- | --- | --- | ---: | ---: |"
  );
  for (const target of entries) {
    const effectiveUrl = target.readiness.effectiveBaseUrl ? `\`${target.readiness.effectiveBaseUrl}\`` : "none";
    const commands = target.readiness.commandsRequired.length > 0
      ? target.readiness.commandsRequired.map((command) => `\`${command}\``).join("<br>")
      : "none";
    lines.push(
      `| ${target.id} | ${target.readiness.status} (${target.readiness.mode}) | ${effectiveUrl} | ${commands} | ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"} | ${target.apiEndpoints.length} | ${target.timeoutMs}ms |`
    );
  }
  lines.push("", "Config inspection does not execute product target commands.", "");
}

function formatCommandList(commands: string[]): string {
  if (commands.length === 0) {
    return "none";
  }

  return commands.map((command) => `\`${command}\``).join("<br>");
}

function getRepoRootForCli(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string {
  try {
    return getRepoRoot(cwd);
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, cwd, options);
  }
}

function getChangedFilesForCli(rootDir: string, options: { base?: string | undefined; head?: string | undefined; format: string }) {
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

function formatGitErrorForCli(
  error: unknown,
  cwd: string,
  options: { base?: string | undefined; head?: string | undefined; format: string }
): Error {
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

function findUnresolvedRef(
  message: string,
  options: { base?: string | undefined; head?: string | undefined }
): string | undefined {
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
