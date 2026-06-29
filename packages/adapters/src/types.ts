import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { FileChange, Finding } from "@submuxhq/codedecay-core";

export type AdapterStatus = "passed" | "failed" | "skipped" | "timed_out" | "error";
export type ConfiguredCommandKind = "test" | "build" | "start" | "probe";

export interface AdapterContext {
  rootDir: string;
  changedFiles: FileChange[];
  config: CodeDecayConfig;
}

export interface AdapterResult {
  id: string;
  name: string;
  status: AdapterStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  findings: Finding[];
  exitCode?: number | undefined;
  error?: string | undefined;
}

export interface CodeDecayAdapter {
  id: string;
  name: string;
  run(context: AdapterContext): Promise<AdapterResult>;
}

export interface ConfiguredCommandAdapter {
  kind: ConfiguredCommandKind;
  command: string;
  adapter: CodeDecayAdapter;
}

export interface CommandAdapterOptions {
  id: string;
  name: string;
  command: string;
  timeoutMs?: number | undefined;
  requiresCommandAllowlist?: boolean | undefined;
}
