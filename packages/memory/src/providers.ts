import { validateMemoryProvider, validateMemoryProviderLoadOptions } from "./provider-validation";
import type { LoadedCodeDecayMemory, MemoryProvider, MemoryProviderLoadOptions } from "./types";

export { createLocalMemoryProvider, loadCodeDecayMemory } from "./provider-local";
export { createMem0MemoryProvider } from "./provider-mem0";
export { createMemoryProviderRegistry, MemoryProviderRegistry } from "./provider-registry";

export function loadCodeDecayMemoryFromProvider(
  provider: MemoryProvider,
  options: MemoryProviderLoadOptions
): LoadedCodeDecayMemory {
  validateMemoryProvider(provider);
  validateMemoryProviderLoadOptions(options);
  const loaded = provider.load(options);
  if (isPromiseLike(loaded)) {
    throw new Error(`Memory provider "${provider.id}" is async. Use loadCodeDecayMemoryFromProviderAsync().`);
  }

  return loaded;
}

export async function loadCodeDecayMemoryFromProviderAsync(
  provider: MemoryProvider,
  options: MemoryProviderLoadOptions
): Promise<LoadedCodeDecayMemory> {
  validateMemoryProvider(provider);
  validateMemoryProviderLoadOptions(options);
  return provider.load(options);
}

function isPromiseLike(value: unknown): value is Promise<LoadedCodeDecayMemory> {
  return typeof value === "object" && value !== null && "then" in value;
}
