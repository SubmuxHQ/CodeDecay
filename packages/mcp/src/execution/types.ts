import type { AdapterResult, AdapterStatus, ConfiguredCommandKind } from "@submuxhq/codedecay-adapters";
import type { Evidence, HarnessFailure } from "@submuxhq/codedecay-harness";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export interface McpExecutionReport {
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

export interface McpExecutionSummary {
  status: AdapterStatus | "not_confirmed";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  errors: number;
  durationMs: number;
}

export interface McpExecutionResult extends AdapterResult {
  kind: ConfiguredCommandKind;
  command: string;
}

export interface McpExecutionToolAdapterResult {
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

export interface McpExecutionSafety {
  confirmExecutionRequired: true;
  confirmExecution: boolean;
  allowCommands: boolean;
  notes: string[];
}
