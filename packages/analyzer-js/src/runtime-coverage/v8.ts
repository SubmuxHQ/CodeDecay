import { readFileSync } from "node:fs";
import { addCoverageLine, normalizeCoveragePath } from "./lines";
import type { RuntimeCoverageLineMapEntry } from "./types";
import { createLineOffsets, lineNumberForOffset } from "./v8/offsets";
import { extractV8Scripts } from "./v8/scripts";
import { readCoverageSourceFile } from "./v8/source";

export function readV8Coverage(rootDir: string, absolutePath: string): Map<string, RuntimeCoverageLineMapEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return new Map();
  }

  const scripts = extractV8Scripts(parsed);
  if (scripts.length === 0) {
    return new Map();
  }

  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();
  for (const script of scripts) {
    const normalizedPath = normalizeCoveragePath(rootDir, script.url);
    if (!normalizedPath) {
      continue;
    }

    const content = readCoverageSourceFile(rootDir, normalizedPath);
    if (!content) {
      continue;
    }

    const lineOffsets = createLineOffsets(content);
    for (const range of script.ranges) {
      const startLine = lineNumberForOffset(lineOffsets, range.startOffset);
      const endLine = lineNumberForOffset(lineOffsets, Math.max(range.startOffset, range.endOffset - 1));
      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, range.count > 0, "v8", absolutePath);
      }
    }
  }

  return linesByFile;
}
