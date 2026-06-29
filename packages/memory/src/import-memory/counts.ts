import type { CodeDecayMemory, MemoryImportCounts } from "../types";

export function countMemoryEntries(memory: CodeDecayMemory): MemoryImportCounts {
  return {
    flows: memory.flows.length,
    commands: memory.commands.length,
    invariants: memory.invariants.length,
    architecture: memory.architecture.length,
    regressions: memory.regressions.length
  };
}

export function createEmptyMemoryImportCounts(): MemoryImportCounts {
  return {
    flows: 0,
    commands: 0,
    invariants: 0,
    architecture: 0,
    regressions: 0
  };
}
