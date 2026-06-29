import type { AdapterResult, AdapterStatus, ConfiguredCommandKind } from "@submuxhq/codedecay-adapters";
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";
import type { ConfigFormat } from "./common";

export interface ExecuteOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
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
