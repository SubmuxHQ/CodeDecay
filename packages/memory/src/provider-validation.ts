import type { MemoryProvider, MemoryProviderLoadOptions } from "./types";

export function validateMemoryProvider(provider: MemoryProvider): void {
  validateNonEmptyString(provider.id, "Memory provider id");
  validateNonEmptyString(provider.name, "Memory provider name");

  if (provider.kind !== "local" && provider.kind !== "external") {
    throw new Error(`Invalid memory provider kind: ${String(provider.kind)}`);
  }

  if (typeof provider.load !== "function") {
    throw new Error(`Memory provider "${provider.id}" must define load().`);
  }
}

export function validateMemoryProviderLoadOptions(options: MemoryProviderLoadOptions): void {
  validateNonEmptyString(options.rootDir, "Memory provider rootDir");
}

export function validateNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}
