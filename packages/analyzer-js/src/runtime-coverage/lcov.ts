import { readFileSync } from "node:fs";
import { addCoverageLine, normalizeCoveragePath } from "./lines";
import type { RuntimeCoverageLineMapEntry } from "./types";

export function readLcovCoverage(rootDir: string, absolutePath: string): Map<string, RuntimeCoverageLineMapEntry> {
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch {
    return new Map();
  }

  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();
  let currentFile: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = normalizeCoveragePath(rootDir, line.slice(3).trim());
      continue;
    }

    if (line.startsWith("DA:") && currentFile) {
      const [rawLine, rawCount] = line.slice(3).split(",");
      const lineNumber = Number(rawLine);
      const count = Number(rawCount);
      if (!Number.isInteger(lineNumber) || Number.isNaN(count)) {
        continue;
      }

      addCoverageLine(linesByFile, currentFile, lineNumber, count > 0, "lcov", absolutePath);
      continue;
    }

    if (line === "end_of_record") {
      currentFile = undefined;
    }
  }

  return linesByFile;
}
