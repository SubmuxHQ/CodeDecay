import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";

export const fixtureRoot = join(process.cwd(), "test/fixtures/high-risk-auth");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

export function change(path: string, content: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content }]
  };
}

export function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-analyzer-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}

export function largeFunction(name: string, lineCount: number): string {
  const bodyLines = Array.from({ length: lineCount - 2 }, (_, index) => `  total += ${index};`);
  return [`export function ${name}() {`, ...bodyLines, "  return total;", "}"].join("\n");
}

export function complexFunction(name: string, branchCount: number): string {
  const branches = Array.from({ length: branchCount }, (_, index) => [
    `  if (input.flag${index}) {`,
    "    score += 1;",
    "  }"
  ].join("\n"));

  return [`export function ${name}(input: Record<string, boolean>) {`, "  let score = 0;", ...branches, "  return score;", "}"].join("\n");
}
