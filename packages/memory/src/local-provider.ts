import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cloneMemory, normalizeMemory, parseJsonMemory } from "./schema";
import { DEFAULT_CODEDECAY_MEMORY } from "./types";
import type { LoadedCodeDecayMemory } from "./types";

export function loadLocalMemory(rootDir: string): LoadedCodeDecayMemory {
  const sourcePath = join(rootDir, ".codedecay", "memory.json");
  if (!existsSync(sourcePath)) {
    return {
      memory: cloneMemory(DEFAULT_CODEDECAY_MEMORY)
    };
  }

  const raw = readFileSync(sourcePath, "utf8");
  return {
    memory: normalizeMemory(parseJsonMemory(raw, sourcePath), sourcePath),
    sourcePath
  };
}
