import type { CapabilityIntentSource, CapabilityPolicy } from "./capability";

export type ExecutionStatus = "passed" | "failed" | "skipped" | "timed_out" | "error" | "blocked";

export interface SafeCommandPolicy {
  allowCommands: boolean;
  allowUnsafeCommands?: boolean | undefined;
  capabilityPolicy?: CapabilityPolicy | undefined;
}

export interface RunConfiguredCommandOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  safety: SafeCommandPolicy;
  stdin?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  outputLimit?: number | undefined;
  /**
   * Who requested this capability. Untrusted sources are always denied.
   * Defaults to user-config for normal CLI/configured-check paths.
   */
  capabilityIntentSource?: CapabilityIntentSource | undefined;
  /** When false, skips writing capability audit events. Defaults to true. */
  capabilityAudit?: boolean | undefined;
}

export interface CommandSafetyCheck {
  safe: boolean;
  reason?: string | undefined;
}

export interface CommandExecutionResult {
  command: string;
  status: ExecutionStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  blockedReason?: string | undefined;
}
