import { readFileSync } from "node:fs";
import { normalizeArtifactPath } from "../../shared/paths";
import type { CoverageLineMapEntry, CoverageParseResult } from "../types";
import { addCoverageLine, coverageParseError, normalizeCoveragePath } from "./shared";

export function readLcovCoverage(cwd: string, absolutePath: string): CoverageParseResult {
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  let currentFile: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = normalizeCoveragePath(cwd, line.slice(3).trim());
      continue;
    }

    if (line.startsWith("DA:") && currentFile) {
      const [rawLine, rawCount] = line.slice(3).split(",");
      const lineNumber = Number(rawLine);
      const count = Number(rawCount);
      if (!Number.isInteger(lineNumber) || Number.isNaN(count)) {
        continue;
      }

      addCoverageLine(linesByFile, currentFile, lineNumber, count > 0, "lcov", normalizeArtifactPath(cwd, absolutePath));
      continue;
    }

    if (line === "end_of_record") {
      currentFile = undefined;
    }
  }

  return { linesByFile };
}
