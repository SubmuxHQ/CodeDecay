import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type { CommandExecutionResult } from "@submuxhq/codedecay-execution";
import type { ProductExplorationResult } from "./exploration";
import type { ProductGeneratedTestRunResult, ProductGeneratedTestsResult } from "./generated";
import type { ProductTargetStatus } from "./status";

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

export interface ProductTargetSafetySummary {
  commandsExecuted: boolean;
  browserAutomationRan: boolean;
  generatedTestsRan: boolean;
  startupCommandsAllowed: boolean;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
}
