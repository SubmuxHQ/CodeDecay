import { cloneMemory } from "./schema";
import type { CodeDecayMemory, MemoryImportResult } from "./types";
import { countMemoryEntries, createEmptyMemoryImportCounts } from "./import-memory/counts";
import {
  mergeArchitectureEntries,
  mergeCommandEntries,
  mergeFlowEntries,
  mergeInvariantEntries,
  mergeRegressionEntries
} from "./import-memory/merge";
import { normalizeImportedMemory } from "./import-memory/normalize";
export { countMemoryEntries } from "./import-memory/counts";
export {
  sortArchitecture,
  sortCommands,
  sortFlows,
  sortInvariants,
  sortRegressions
} from "./import-memory/sort";

export function importCodeDecayMemory(
  baseMemory: CodeDecayMemory,
  importedValue: unknown,
  sourceName: string = "memory import"
): MemoryImportResult {
  const importedMemory = normalizeImportedMemory(importedValue, sourceName);
  const base = cloneMemory(baseMemory);
  const added = createEmptyMemoryImportCounts();
  const merged = createEmptyMemoryImportCounts();

  return {
    memory: {
      version: 1,
      flows: mergeFlowEntries(base.flows, importedMemory.flows, added, merged),
      commands: mergeCommandEntries(base.commands, importedMemory.commands, added, merged),
      invariants: mergeInvariantEntries(base.invariants, importedMemory.invariants, added, merged),
      architecture: mergeArchitectureEntries(base.architecture, importedMemory.architecture, added, merged),
      regressions: mergeRegressionEntries(base.regressions, importedMemory.regressions, added, merged)
    },
    added,
    merged
  };
}
