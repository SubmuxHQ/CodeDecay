import { readFileSync } from "node:fs";
import { normalizeArtifactPath, readLocalFile } from "../../shared/paths";
import { isPlainObject } from "../../shared/values";
import type { CoverageLineMapEntry, CoverageParseResult } from "../types";
import { addCoverageLine, coverageParseError, normalizeCoveragePath } from "./shared";

export function readV8Coverage(cwd: string, absolutePath: string): CoverageParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  for (const script of extractV8Scripts(parsed)) {
    const normalizedPath = normalizeCoveragePath(cwd, script.url);
    if (!normalizedPath) {
      continue;
    }

    const content = readLocalFile(cwd, normalizedPath);
    if (!content) {
      continue;
    }

    const lineOffsets = createLineOffsets(content);
    for (const range of script.ranges) {
      const startLine = lineNumberForOffset(lineOffsets, range.startOffset);
      const endLine = lineNumberForOffset(lineOffsets, Math.max(range.startOffset, range.endOffset - 1));
      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, range.count > 0, "v8", normalizeArtifactPath(cwd, absolutePath));
      }
    }
  }

  return { linesByFile };
}

function extractV8Scripts(value: unknown): Array<{ url: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> {
  const results = Array.isArray(value)
    ? value
    : isPlainObject(value) && Array.isArray(value.result)
      ? value.result
      : [];
  const scripts: Array<{ url: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> = [];

  for (const script of results) {
    if (!isPlainObject(script) || typeof script.url !== "string" || !Array.isArray(script.functions)) {
      continue;
    }

    const ranges: Array<{ startOffset: number; endOffset: number; count: number }> = [];
    for (const fn of script.functions) {
      if (!isPlainObject(fn) || !Array.isArray(fn.ranges)) {
        continue;
      }

      for (const range of fn.ranges) {
        if (!isPlainObject(range)) {
          continue;
        }

        const startOffset = Number(range.startOffset);
        const endOffset = Number(range.endOffset);
        const count = Number(range.count);
        if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || Number.isNaN(count)) {
          continue;
        }

        ranges.push({ startOffset, endOffset, count });
      }
    }

    if (ranges.length > 0) {
      scripts.push({ url: script.url, ranges });
    }
  }

  return scripts;
}

function createLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function lineNumberForOffset(offsets: number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = offsets[mid] ?? 0;
    const next = offsets[mid + 1] ?? Number.MAX_SAFE_INTEGER;
    if (offset >= current && offset < next) {
      return mid + 1;
    }

    if (offset < current) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return offsets.length;
}
