import { readFileSync } from "node:fs";
import { normalizeArtifactPath } from "../../shared/paths";
import { isPlainObject } from "../../shared/values";
import type { CoverageLineMapEntry, CoverageParseResult } from "../types";
import { addCoverageLine, coverageParseError, normalizeCoveragePath } from "./shared";

export function readIstanbulCoverage(cwd: string, absolutePath: string): CoverageParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  if (!isPlainObject(parsed)) {
    return { linesByFile: new Map() };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  for (const [rawPath, value] of Object.entries(parsed)) {
    if (!isPlainObject(value)) {
      continue;
    }

    const normalizedPath = normalizeCoveragePath(cwd, rawPath);
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

        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", normalizeArtifactPath(cwd, absolutePath));
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
        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", normalizeArtifactPath(cwd, absolutePath));
      }
    }
  }

  return { linesByFile };
}
