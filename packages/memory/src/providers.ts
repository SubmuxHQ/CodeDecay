import { validateMemoryProvider, validateMemoryProviderLoadOptions } from "./provider-validation";
import type { LoadedCodeDecayMemory, MemoryProvider, MemoryProviderLoadOptions } from "./types";

export { createLocalMemoryProvider, loadCodeDecayMemory } from "./provider-local";
export { createMemoryProviderRegistry, MemoryProviderRegistry } from "./provider-registry";

export function loadCodeDecayMemoryFromProvider(
  provider: MemoryProvider,
  options: MemoryProviderLoadOptions
): LoadedCodeDecayMemory {
  validateMemoryProvider(provider);
  validateMemoryProviderLoadOptions(options);
  return provider.load(options);
}
