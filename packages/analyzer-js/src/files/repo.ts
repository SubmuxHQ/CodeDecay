import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".next", "build"]);

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
      if (IGNORED_DIRS.has(entry)) {
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
        visit(absolutePath);
      } else {
        files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
      }
    }
  }

  visit(rootDir);
  return files;
}
