import { loadLocalMemory } from "./local-provider";
import type { LoadedCodeDecayMemory, MemoryProvider, MemoryProviderLoadOptions } from "./types";

export function loadCodeDecayMemory(rootDir: string): LoadedCodeDecayMemory {
  return createLocalMemoryProvider().load({ rootDir });
}

export function loadCodeDecayMemoryFromProvider(
  provider: MemoryProvider,
  options: MemoryProviderLoadOptions
): LoadedCodeDecayMemory {
  validateMemoryProvider(provider);
  validateMemoryProviderLoadOptions(options);
  return provider.load(options);
}

export function createLocalMemoryProvider(): MemoryProvider {
  return {
    id: "local",
    name: "Local .codedecay memory",
    kind: "local",
    load: ({ rootDir }) => loadLocalMemory(rootDir)
  };
}

export class MemoryProviderRegistry {
  private readonly providers = new Map<string, MemoryProvider>();

  constructor(providers: MemoryProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: MemoryProvider): void {
    validateMemoryProvider(provider);

    if (this.providers.has(provider.id)) {
      throw new Error(`Memory provider already registered: ${provider.id}`);
    }

    this.providers.set(provider.id, provider);
  }

  get(id: string): MemoryProvider | undefined {
    validateNonEmptyString(id, "Memory provider id");
    return this.providers.get(id);
  }

  require(id: string): MemoryProvider {
    const provider = this.get(id);
    if (!provider) {
      throw new Error(`Memory provider not found: ${id}`);
    }

    return provider;
  }

  list(): MemoryProvider[] {
    return [...this.providers.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  load(id: string, options: MemoryProviderLoadOptions): LoadedCodeDecayMemory {
    return loadCodeDecayMemoryFromProvider(this.require(id), options);
  }
}

export function createMemoryProviderRegistry(providers: MemoryProvider[] = [createLocalMemoryProvider()]): MemoryProviderRegistry {
  return new MemoryProviderRegistry(providers);
}

function validateMemoryProvider(provider: MemoryProvider): void {
  validateNonEmptyString(provider.id, "Memory provider id");
  validateNonEmptyString(provider.name, "Memory provider name");

  if (provider.kind !== "local" && provider.kind !== "external") {
    throw new Error(`Invalid memory provider kind: ${String(provider.kind)}`);
  }

  if (typeof provider.load !== "function") {
    throw new Error(`Memory provider "${provider.id}" must define load().`);
  }
}

function validateMemoryProviderLoadOptions(options: MemoryProviderLoadOptions): void {
  validateNonEmptyString(options.rootDir, "Memory provider rootDir");
}

function validateNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}
