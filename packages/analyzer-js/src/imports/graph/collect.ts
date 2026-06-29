import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSourcePath, isTestPath } from "../../classifiers/paths";
import { listRepoFiles } from "../../files/repo";
import { normalizePath } from "./path";
import { resolveLocalImportSpecifier } from "./resolve";
import { extractLocalImportSpecifiers } from "./specifiers";

export function buildReverseImportGraph(rootDir: string): Map<string, string[]> {
  const repoSourceFiles = listRepoFiles(rootDir)
    .map((file) => normalizePath(file))
    .filter((file) => isSourcePath(file) && !isTestPath(file));
  const repoSourceSet = new Set(repoSourceFiles);
  const importersBySource = new Map<string, Set<string>>();

  for (const file of repoSourceFiles) {
    const content = readRepoFile(rootDir, file);
    if (!content) {
      continue;
    }

    for (const specifier of extractLocalImportSpecifiers(content)) {
      const resolved = resolveLocalImportSpecifier(file, specifier, repoSourceSet);
      if (!resolved) {
        continue;
      }

      const importers = importersBySource.get(resolved) ?? new Set<string>();
      importers.add(file);
      importersBySource.set(resolved, importers);
    }
  }

  return new Map(
    [...importersBySource.entries()].map(([source, importers]) => [
      source,
      [...importers].sort((left, right) => left.localeCompare(right))
    ])
  );
}

function readRepoFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}
