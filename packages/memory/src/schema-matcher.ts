import type { MemoryMatcher } from "./types";
import { optionalAreas, optionalStringArray } from "./schema-primitives";

export function normalizeMatcher(object: Record<string, unknown>, sourcePath: string, field: string): MemoryMatcher {
  const productPaths = optionalStringArray(object.productPaths, sourcePath, `${field}.productPaths`);

  return {
    files: optionalStringArray(object.files, sourcePath, `${field}.files`),
    areas: optionalAreas(object.areas, sourcePath, `${field}.areas`),
    productPaths: productPaths ? productPaths.map(normalizeProductPath) : undefined
  };
}

export function normalizeProductPath(path: string): string {
  const normalized = path.trim().split(/[?#]/, 1)[0] || "/";
  if (normalized === "/") {
    return normalized;
  }

  return trimTrailingSlashes(normalized) || "/";
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}
