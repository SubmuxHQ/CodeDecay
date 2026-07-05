import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type { ConfigFormat } from "./common";

export interface DifferentialOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
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
  apiContracts: DifferentialApiContractResult[];
}

export interface DifferentialSummary {
  status: DifferentialStatus;
  total: number;
  unchanged: number;
  changed: number;
  skipped: number;
  failed: number;
  durationMs: number;
  apiContracts: DifferentialApiContractSummary;
}

export interface DifferentialApiContractSummary {
  total: number;
  passed: number;
  changed: number;
  failed: number;
  breakingChanges: number;
  nonBreakingChanges: number;
}

export interface DifferentialProbeResult {
  id: string;
  name: string;
  command: string;
  status: DifferentialStatus;
  differences: string[];
  rerunCommand: string;
  artifacts?: DifferentialProbeArtifacts | undefined;
  base: DifferentialSideResult;
  head: DifferentialSideResult;
}

export interface DifferentialProbeArtifacts {
  directory: string;
  baseResult: string;
  headResult: string;
  baseStdout: string;
  headStdout: string;
  baseStderr: string;
  headStderr: string;
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

export interface DifferentialApiContractResult {
  id: string;
  schemaPath: string;
  status: DifferentialStatus;
  breakingChanges: DifferentialApiContractChange[];
  nonBreakingChanges: DifferentialApiContractChange[];
  errors: string[];
  rerunCommand: string;
  base?: DifferentialApiContractSide | undefined;
  head?: DifferentialApiContractSide | undefined;
}

export interface DifferentialApiContractSide {
  schemaPath: string;
  exists: boolean;
  operationCount: number;
}

export type DifferentialApiContractChangeKind =
  | "removed-path"
  | "added-path"
  | "removed-method"
  | "added-method"
  | "removed-status-code"
  | "added-status-code"
  | "removed-response-field"
  | "added-response-field"
  | "response-required-field-removed"
  | "response-required-field-added"
  | "required-request-parameter-added"
  | "request-parameter-became-required"
  | "optional-request-parameter-added";

export interface DifferentialApiContractChange {
  kind: DifferentialApiContractChangeKind;
  severity: "breaking" | "non-breaking";
  path: string;
  method?: string | undefined;
  statusCode?: string | undefined;
  schemaPath?: string | undefined;
  message: string;
  base?: string | undefined;
  head?: string | undefined;
}
