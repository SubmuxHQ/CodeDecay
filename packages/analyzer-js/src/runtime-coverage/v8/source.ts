import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readCoverageSourceFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}
