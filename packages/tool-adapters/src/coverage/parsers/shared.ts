import { relative } from "node:path";
import { normalizeArtifactPath, normalizePath } from "../../shared/paths";
import type { CoverageLineMapEntry, CoverageSourceKind } from "../types";

export function addCoverageLine(
  linesByFile: Map<string, CoverageLineMapEntry>,
  path: string,
  line: number,
  covered: boolean,
  sourceKind: CoverageSourceKind,
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
      sourceKinds: new Set<CoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies CoverageLineMapEntry);

  entry.measured.add(line);
  if (covered) {
    entry.covered.add(line);
  }
  entry.sourceKinds.add(sourceKind);
  entry.sourcePaths.add(normalizePath(sourcePath));
  linesByFile.set(path, entry);
}

export function normalizeCoveragePath(cwd: string, rawPath: string): string | undefined {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return undefined;
  }

  const normalizedInput = normalizePath(rawPath.trim().replace(/^file:\/\//, ""));
  if (normalizedInput.includes("://")) {
    return undefined;
  }

  if (normalizedInput.startsWith("/")) {
    const relativePath = relative(cwd, normalizedInput).replaceAll("\\", "/");
    if (!relativePath.startsWith("../")) {
      return relativePath;
    }
  }

  return normalizedInput.replace(/^\.\//, "");
}

export function coverageParseError(cwd: string, absolutePath: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not parse coverage report at ${normalizeArtifactPath(cwd, absolutePath)}: ${message}`;
}
