import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function listCoverageFiles(rootDir: string, currentDir: string): string[] {
  const files: string[] = [];
  const relativeDir = relative(rootDir, currentDir).replaceAll("\\", "/");
  if (relativeDir.startsWith("..")) {
    return files;
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCoverageFiles(rootDir, absolutePath));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}
