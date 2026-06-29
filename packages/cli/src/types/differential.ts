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
