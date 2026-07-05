import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const IGNORED_DIR_NAMES = new Set([".git", "node_modules", "dist", "coverage", ".next", "build"]);
const IGNORED_RELATIVE_DIRS = new Set([
  ".codedecay/local",
  ".codedecay/data",
  ".codedecay/github-packages",
  "docs/.vitepress/cache",
  "docs/.vitepress/dist"
]);

export function listRepoFiles(rootDir: string): string[] {
  const files: string[] = [];

  function visit(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIR_NAMES.has(entry)) {
        continue;
      }

      const absolutePath = join(currentDir, entry);
      let stats;
      try {
        stats = statSync(absolutePath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        const relativePath = relative(rootDir, absolutePath).replaceAll("\\", "/");
        if (IGNORED_RELATIVE_DIRS.has(relativePath)) {
          continue;
        }

        visit(absolutePath);
      } else {
        files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
      }
    }
  }

  visit(rootDir);
  return files;
}
