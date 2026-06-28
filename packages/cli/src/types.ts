import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AdapterResult, AdapterStatus, ConfiguredCommandKind } from "@submuxhq/codedecay-adapters";
import type { AgentProfileId, AgentTaskBundleFormat } from "@submuxhq/codedecay-agent";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type { CodeDecayReport, ProductFailureClassification, RiskLevel, TestEvidenceMode } from "@submuxhq/codedecay-core";
import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import type { LlmSuggestion } from "@submuxhq/codedecay-llm";
import type { LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { RedteamFormat } from "@submuxhq/codedecay-redteam";
import type { ReportFormat } from "@submuxhq/codedecay-report";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export interface AnalyzeOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ReportFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

export interface AgentOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: AgentTaskBundleFormat;
  profile: AgentProfileId;
  output?: string | undefined;
}

export interface ConfigOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
}

export interface McpOptions {
  cwd?: string | undefined;
}

export interface MemoryOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
}

export interface MemoryImportOptions {
  cwd?: string | undefined;
  input: string;
  format: ConfigFormat;
  apply: boolean;
}

export interface MemoryLearnOptions {
  cwd?: string | undefined;
  input: string;
  format: ConfigFormat;
  apply: boolean;
}

export interface SnapshotOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  compare?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

export interface LlmReviewOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  task?: string | undefined;
  ping: boolean;
}

export interface ExecuteOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

export interface ProductOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  target?: string | undefined;
  testId?: string | undefined;
  explore: boolean;
  generateTests: boolean;
  runGeneratedTests: boolean;
  generateApiTests: boolean;
  runGeneratedApiTests: boolean;
  failOnClassifications?: ProductFailureClassification[] | undefined;
  maxPages: number;
  maxActions: number;
  allowDestructiveActions: boolean;
}

export interface DashboardOptions {
  cwd?: string | undefined;
  output?: string | undefined;
  format: ConfigFormat;
  inputPaths: string[];
}

export interface DifferentialOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

export interface RedteamOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: RedteamFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface UpdateOptions {
  cwd?: string | undefined;
  manager?: PackageManager | undefined;
  apply: boolean;
}

export interface UninstallOptions {
  cwd?: string | undefined;
  manager?: PackageManager | undefined;
  apply: boolean;
  purgeLocal: boolean;
}

export interface UpdatePlan {
  manager?: PackageManager | undefined;
  source: string;
  displayCommand: string;
  command: string;
  args: string[];
  canApply: boolean;
}

export interface UninstallPlan {
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

export interface ExecutionReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  configSource?: string | undefined;
  summary: ExecutionSummary;
  results: ExecutionResult[];
  toolAdapters: ExecutionToolAdapterResult[];
}

export interface ProductTargetReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  configSource?: string | undefined;
  summary: ProductTargetSummary;
  targets: ProductTargetResult[];
  safety: ProductTargetSafetySummary;
}

export interface ProductTargetSummary {
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

export type ProductTargetStatus = "passed" | "failed" | "skipped" | "blocked" | "timed_out";

export interface ProductTargetResult {
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

export interface ProductStartResult {
  command: string;
  status: "started" | "skipped" | "blocked" | "error";
  durationMs: number;
  stdout: string;
  stderr: string;
  pid?: number | undefined;
  error?: string | undefined;
  blockedReason?: string | undefined;
}

export interface ManagedProductProcess extends ProductStartResult {
  child?: ChildProcessWithoutNullStreams | undefined;
}

export interface ProductHealthResult {
  url: string;
  status: ProductTargetStatus;
  attempts: number;
  durationMs: number;
  httpStatus?: number | undefined;
  error?: string | undefined;
}

export interface ProductExplorationResult {
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

export interface ProductGeneratedTestsResult {
  status: ProductTargetStatus;
  sourcePath?: string | undefined;
  manifestPath?: string | undefined;
  tests: ProductGeneratedTestCase[];
  durationMs: number;
  error?: string | undefined;
  notes: string[];
}

export interface ProductGeneratedTestCase {
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

export interface ProductGeneratedTestManifest {
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

export interface ProductGeneratedTestRunResult {
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

export interface ProductGeneratedTestFailure {
  testId?: string | undefined;
  title: string;
  failingStep: string;
  error: string;
  retryEvidence?: ProductGeneratedTestRetryEvidence | undefined;
  classification?: ProductFailureClassification | undefined;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  suggestedFixTasks?: string[] | undefined;
  request?: ProductGeneratedTestFailureRequest | undefined;
  expected?: string | undefined;
  actual?: string | undefined;
  impactedFiles?: string[] | undefined;
  testSourcePath: string;
  testSource: string;
  rerunCommand: string;
}

export interface ProductGeneratedTestRetryEvidence {
  attempts: number;
  passed: number;
  failed: number;
  command?: string | undefined;
  conclusion: "passed-on-rerun" | "failed-on-rerun" | "not-rerun";
  error?: string | undefined;
}

export interface ProductGeneratedTestFailureRequest {
  method: string;
  url: string;
}

export interface ProductExplorerOptions {
  maxPages: number;
  maxActions: number;
  allowDestructiveActions: boolean;
}

export interface ProductFlowMap {
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

export interface ProductFlowPage {
  url: string;
  title: string;
  path: string;
  depth: number;
  links: ProductFlowLink[];
  interactiveElements: ProductInteractiveElement[];
  screenshotPath?: string | undefined;
}

export interface ProductFlowLink {
  href: string;
  text: string;
  selector: string;
  sameOrigin: boolean;
  discovered: boolean;
}

export interface ProductInteractiveElement {
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

export interface ProductBlockedAction {
  pageUrl: string;
  selector: string;
  name: string;
  reason: string;
}

export interface ProductTargetSafetySummary {
  commandsExecuted: boolean;
  browserAutomationRan: boolean;
  generatedTestsRan: boolean;
  startupCommandsAllowed: boolean;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
}

export interface ExecutionSummary {
  status: AdapterStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  errors: number;
  durationMs: number;
}

export interface ExecutionResult extends AdapterResult {
  kind: ConfiguredCommandKind;
  command: string;
}

export interface ExecutionToolAdapterResult {
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

export type DifferentialStatus = "passed" | "changed" | "skipped" | "failed";

export interface DifferentialReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  base: string;
  head: string;
  configSource?: string | undefined;
  summary: DifferentialSummary;
  results: DifferentialProbeResult[];
}

export interface DifferentialSummary {
  status: DifferentialStatus;
  total: number;
  unchanged: number;
  changed: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

export interface DifferentialProbeResult {
  id: string;
  name: string;
  command: string;
  status: DifferentialStatus;
  differences: string[];
  base: DifferentialSideResult;
  head: DifferentialSideResult;
}

export interface DifferentialSideResult {
  status: AdapterStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  structuredOutput?: unknown;
}

export interface CliRuntime {
  cwd?: string | undefined;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export interface CliCommandContext {
  args: string[];
  runtime: CliRuntime;
  runtimeCwd: string;
}

export interface CliAnalysisContext {
  report: CodeDecayReport;
  loadedMemory: LoadedCodeDecayMemory;
}

export interface TrendSnapshot {
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

export interface TrendSnapshotComparison {
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

export interface LlmReviewReport {
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

export type CliCommandHandler = (context: CliCommandContext) => Promise<void> | void;
export type ConfigFormat = "json" | "markdown";
