export type ExecutionStatus = "passed" | "failed" | "skipped" | "timed_out" | "error" | "blocked";

export interface SafeCommandPolicy {
  allowCommands: boolean;
  allowUnsafeCommands?: boolean | undefined;
}

export interface RunConfiguredCommandOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  safety: SafeCommandPolicy;
  env?: Record<string, string | undefined> | undefined;
  outputLimit?: number | undefined;
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
