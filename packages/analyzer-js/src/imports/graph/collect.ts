import { readCachedAnalyzerArtifacts } from "../../cache/artifacts";
import { isSourcePath, isTestPath } from "../../classifiers/paths";
import { listRepoFiles } from "../../files/repo";
import { normalizePath } from "./path";
import { resolveLocalImportSpecifier } from "./resolve";
import { extractLocalImportSpecifiers } from "./specifiers";

export function buildReverseImportGraph(rootDir: string): Map<string, string[]> {
  const sourceFiles = listRepoFiles(rootDir)
    .map((file) => normalizePath(file))
    .filter((file) => isSourcePath(file));
  const repoSourceFiles = sourceFiles.filter((file) => !isTestPath(file));
  const repoSourceSet = new Set(repoSourceFiles);
  const importersBySource = new Map<string, Set<string>>();
  const cached = readCachedAnalyzerArtifacts({
    rootDir,
    files: repoSourceFiles,
    currentFiles: sourceFiles,
    requireSymbols: false,
    parse: (_path, content) => ({
      exports: [],
      imports: [],
      calls: [],
      localImportSpecifiers: extractLocalImportSpecifiers(content),
      isRouteFile: false,
      symbolsComplete: false
    })
  });

  for (const file of cached.files) {
    for (const specifier of file.localImportSpecifiers) {
      const resolved = resolveLocalImportSpecifier(file.path, specifier, repoSourceSet);
      if (!resolved) {
        continue;
      }

      const importers = importersBySource.get(resolved) ?? new Set<string>();
      importers.add(file.path);
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
