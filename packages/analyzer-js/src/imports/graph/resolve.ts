import { dirname, extname, join } from "node:path";
import { normalizePath } from "./path";

const SOURCE_EXTENSION_CANDIDATES = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];

export function resolveLocalImportSpecifier(
  importerPath: string,
  specifier: string,
  repoSourceSet: Set<string>
): string | undefined {
  const relativeTarget = normalizePath(join(dirname(importerPath), specifier));
  const candidates = new Set<string>();
  candidates.add(relativeTarget);

  if (!extname(relativeTarget)) {
    for (const extension of SOURCE_EXTENSION_CANDIDATES) {
      candidates.add(`${relativeTarget}${extension}`);
      candidates.add(`${relativeTarget}/index${extension}`);
    }
  }

  for (const candidate of candidates) {
    if (repoSourceSet.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
