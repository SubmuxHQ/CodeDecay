import type { RunConfiguredCommandOptions } from "./types";

export function validateRunOptions(options: RunConfiguredCommandOptions): void {
  validateNonEmptyString(options.command, "Command");
  validateNonEmptyString(options.cwd, "Command cwd");

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Command timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Command outputLimit must be a positive integer.");
  }
}

export function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}
