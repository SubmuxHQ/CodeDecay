import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type { ProductFailureClassification } from "@submuxhq/codedecay-core";
import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import type { ConfigFormat } from "./common";

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
