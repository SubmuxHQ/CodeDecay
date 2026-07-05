import {
  countMemoryEntries,
  importCodeDecayMemory
} from "./import-memory";
import { normalizeLearnedMemoryWithProposals } from "./learn-memory/normalize";
import { createMemoryLearningContext, finalizeMemoryProposals } from "./learn-memory/proposals";
import type { CodeDecayMemory, MemoryLearnResult } from "./types";

export function learnCodeDecayMemory(
  baseMemory: CodeDecayMemory,
  learnedValue: unknown,
  sourceName: string = "memory learn",
  options: { timestamp?: string | undefined } = {}
): MemoryLearnResult {
  const context = createMemoryLearningContext(sourceName, options.timestamp ?? new Date().toISOString());
  const learned = normalizeLearnedMemoryWithProposals(learnedValue, sourceName, context);
  const learnedMemory = learned.memory;
  const result = importCodeDecayMemory(baseMemory, learnedMemory, sourceName);

  return {
    ...result,
    learned: countMemoryEntries(learnedMemory),
    proposals: finalizeMemoryProposals(learned.proposals)
  };
}
