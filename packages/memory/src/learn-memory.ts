import {
  countMemoryEntries,
  importCodeDecayMemory
} from "./import-memory";
import { normalizeLearnedMemory } from "./learn-memory/normalize";
import type { CodeDecayMemory, MemoryLearnResult } from "./types";

export function learnCodeDecayMemory(
  baseMemory: CodeDecayMemory,
  learnedValue: unknown,
  sourceName: string = "memory learn"
): MemoryLearnResult {
  const learnedMemory = normalizeLearnedMemory(learnedValue, sourceName);
  const result = importCodeDecayMemory(baseMemory, learnedMemory, sourceName);

  return {
    ...result,
    learned: countMemoryEntries(learnedMemory)
  };
}
