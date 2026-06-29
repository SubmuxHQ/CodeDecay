import type { CommandAdapterOptions } from "./types";

export function validateCommandAdapterOptions(options: CommandAdapterOptions): void {
  if (!isIdentifier(options.id)) {
    throw new Error("Adapter id is required.");
  }

  if (!isIdentifier(options.name)) {
    throw new Error("Adapter name is required.");
  }

  if (!isIdentifier(options.command)) {
    throw new Error("Adapter command is required.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Adapter timeoutMs must be a positive integer.");
  }
}

function isIdentifier(value: string): boolean {
  return value.trim().length > 0;
}
