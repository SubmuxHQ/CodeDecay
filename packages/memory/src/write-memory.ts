import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeDecayMemory } from "./types";

export function writeCodeDecayMemory(rootDir: string, memory: CodeDecayMemory): string {
  const directory = join(rootDir, ".codedecay");
  const sourcePath = join(directory, "memory.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return sourcePath;
}
