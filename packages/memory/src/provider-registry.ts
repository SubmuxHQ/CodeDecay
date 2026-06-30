import { createLocalMemoryProvider } from "./provider-local";
import {
  validateMemoryProvider,
  validateMemoryProviderLoadOptions,
  validateNonEmptyString
} from "./provider-validation";
import type { LoadedCodeDecayMemory, MemoryProvider, MemoryProviderLoadOptions } from "./types";

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
    validateMemoryProviderLoadOptions(options);
    const loaded = this.require(id).load(options);
    if (isPromiseLike(loaded)) {
      throw new Error(`Memory provider "${id}" is async. Use loadAsync().`);
    }

    return loaded;
  }

  async loadAsync(id: string, options: MemoryProviderLoadOptions): Promise<LoadedCodeDecayMemory> {
    validateMemoryProviderLoadOptions(options);
    return this.require(id).load(options);
  }
}

export function createMemoryProviderRegistry(providers: MemoryProvider[] = [createLocalMemoryProvider()]): MemoryProviderRegistry {
  return new MemoryProviderRegistry(providers);
}

function isPromiseLike(value: unknown): value is Promise<LoadedCodeDecayMemory> {
  return typeof value === "object" && value !== null && "then" in value;
}
