import { loadLocalMemory } from "./local-provider";
import type { LoadedCodeDecayMemory, MemoryProvider } from "./types";

export function loadCodeDecayMemory(rootDir: string): LoadedCodeDecayMemory {
  return createLocalMemoryProvider().load({ rootDir });
}

export function createLocalMemoryProvider(): MemoryProvider {
  return {
    id: "local",
    name: "Local .codedecay memory",
    kind: "local",
    load: ({ rootDir }) => loadLocalMemory(rootDir)
  };
}
