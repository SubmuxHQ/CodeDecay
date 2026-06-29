import { relative } from "node:path";
import type { RuntimeCoverageSourceKind } from "@submuxhq/codedecay-core";
import type { RuntimeCoverageLineMapEntry } from "./types";
import { normalizePath } from "./utils";

export function addCoverageLine(
  linesByFile: Map<string, RuntimeCoverageLineMapEntry>,
  path: string,
  line: number,
  covered: boolean,
  sourceKind: RuntimeCoverageSourceKind,
  sourcePath: string
): void {
  if (!Number.isInteger(line) || line <= 0) {
    return;
  }

  const entry =
    linesByFile.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<RuntimeCoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies RuntimeCoverageLineMapEntry);

  entry.measured.add(line);
  if (covered) {
    entry.covered.add(line);
  }
  entry.sourceKinds.add(sourceKind);
  entry.sourcePaths.add(normalizePath(sourcePath));
  linesByFile.set(path, entry);
}

export function normalizeCoveragePath(rootDir: string, rawPath: string): string | undefined {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return undefined;
  }

  const normalizedInput = normalizePath(rawPath.trim().replace(/^file:\/\//, ""));
  if (normalizedInput.includes("://")) {
    return undefined;
  }

  if (normalizedInput.startsWith("/")) {
    const relativePath = relative(rootDir, normalizedInput).replaceAll("\\", "/");
    if (!relativePath.startsWith("../")) {
      return relativePath;
    }
  }

  return normalizedInput.replace(/^\.\//, "");
}
