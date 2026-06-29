import { readFileSync } from "node:fs";
import { addCoverageLine, normalizeCoveragePath } from "./lines";
import type { RuntimeCoverageLineMapEntry } from "./types";
import { isPlainObject } from "./utils";

export function readIstanbulCoverage(rootDir: string, absolutePath: string): Map<string, RuntimeCoverageLineMapEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return new Map();
  }

  if (!isPlainObject(parsed)) {
    return new Map();
  }

  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();
  for (const [rawPath, value] of Object.entries(parsed)) {
    if (!isPlainObject(value)) {
      continue;
    }

    const normalizedPath = normalizeCoveragePath(rootDir, rawPath);
    if (!normalizedPath) {
      continue;
    }

    if (isPlainObject(value.l)) {
      for (const [rawLine, rawCount] of Object.entries(value.l)) {
        const line = Number(rawLine);
        const count = Number(rawCount);
        if (!Number.isInteger(line) || Number.isNaN(count)) {
          continue;
        }

        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", absolutePath);
      }
      continue;
    }

    if (!isPlainObject(value.statementMap) || !isPlainObject(value.s)) {
      continue;
    }

    for (const [statementId, statement] of Object.entries(value.statementMap)) {
      if (!isPlainObject(statement) || !isPlainObject(statement.start) || !isPlainObject(statement.end)) {
        continue;
      }

      const startLine = Number(statement.start.line);
      const endLine = Number(statement.end.line);
      const count = Number(value.s[statementId]);
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || Number.isNaN(count)) {
        continue;
      }

      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", absolutePath);
      }
    }
  }

  return linesByFile;
}
