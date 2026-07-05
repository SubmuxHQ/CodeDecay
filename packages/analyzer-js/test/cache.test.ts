import { mkdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYZER_CACHE_PATH, getAnalyzerCacheSummary } from "../src";
import { buildReverseImportGraph } from "../src/imports/graph";
import { analyzeSymbolImpacts } from "../src/symbols/graph";
import { change, createTempProject } from "./helpers/integration";

describe("analyzer cache", () => {
  it("records cold misses and then reuses unchanged file artifacts", () => {
    const rootDir = createCacheFixture();

    analyzeChangedModule(rootDir);
    const coldSummary = getAnalyzerCacheSummary(rootDir);

    expect(coldSummary.exists).toBe(true);
    expect(coldSummary.path).toBe(ANALYZER_CACHE_PATH);
    expect(coldSummary.fileCount).toBeGreaterThanOrEqual(3);
    expect(coldSummary.lastRun?.filesSeen).toBeGreaterThanOrEqual(3);
    expect(coldSummary.lastRun?.cacheMisses).toBeGreaterThanOrEqual(3);

    analyzeChangedModule(rootDir);
    const warmSummary = getAnalyzerCacheSummary(rootDir);

    expect(warmSummary.lastRun?.filesSeen).toBeGreaterThanOrEqual(3);
    expect(warmSummary.lastRun?.cacheHits).toBe(warmSummary.lastRun?.filesSeen);
    expect(warmSummary.lastRun?.cacheMisses).toBe(0);
    expect(warmSummary.lastRun?.deletedEntries).toBe(0);
  });

  it("misses only changed files and records stale cache entries", () => {
    const rootDir = createCacheFixture();
    analyzeChangedModule(rootDir);

    writeProjectFile(rootDir, "src/b.ts", [
      "export function b() {",
      "  return 'changed value';",
      "}",
      ""
    ].join("\n"));
    analyzeChangedModule(rootDir, "src/b.ts");
    const summary = getAnalyzerCacheSummary(rootDir);

    expect(summary.lastRun?.cacheMisses).toBeGreaterThanOrEqual(1);
    expect(summary.lastRun?.staleEntries).toBeGreaterThanOrEqual(1);
    expect(summary.lastRun?.cacheHits).toBeGreaterThanOrEqual(1);
  });

  it("hash-validates unchanged content when file metadata changes", () => {
    const rootDir = createCacheFixture();
    analyzeChangedModule(rootDir);
    const path = join(rootDir, "src/a.ts");
    const original = readFileSync(path, "utf8");
    const future = new Date(Date.now() + 60_000);
    writeFileSync(path, original, "utf8");
    utimesSync(path, future, future);

    analyzeChangedModule(rootDir);
    const summary = getAnalyzerCacheSummary(rootDir);

    expect(summary.lastRun?.hashValidatedHits).toBeGreaterThanOrEqual(1);
    expect(summary.lastRun?.cacheMisses).toBe(0);
  });

  it("removes deleted file entries deterministically", () => {
    const rootDir = createCacheFixture();
    analyzeChangedModule(rootDir);
    const before = getAnalyzerCacheSummary(rootDir);

    rmSync(join(rootDir, "src/c.ts"));
    analyzeChangedModule(rootDir);
    const after = getAnalyzerCacheSummary(rootDir);

    expect(after.lastRun?.deletedEntries).toBeGreaterThanOrEqual(1);
    expect(after.fileCount).toBeLessThan(before.fileCount);
  });

  it("treats a rename as one deletion and one new cache miss", () => {
    const rootDir = createCacheFixture();
    analyzeChangedModule(rootDir);

    renameSync(join(rootDir, "src/c.ts"), join(rootDir, "src/d.ts"));
    writeProjectFile(rootDir, "src/b.ts", [
      "import { d } from './d';",
      "export function b() {",
      "  return d();",
      "}",
      ""
    ].join("\n"));
    analyzeChangedModule(rootDir, "src/d.ts");
    const summary = getAnalyzerCacheSummary(rootDir);

    expect(summary.lastRun?.deletedEntries).toBeGreaterThanOrEqual(1);
    expect(summary.lastRun?.cacheMisses).toBeGreaterThanOrEqual(1);
  });

  it("ignores and rewrites corrupted cache documents", () => {
    const rootDir = createCacheFixture();
    writeProjectFile(rootDir, ANALYZER_CACHE_PATH, "{not json");

    analyzeChangedModule(rootDir);
    const summary = getAnalyzerCacheSummary(rootDir);

    expect(summary.corrupted).toBe(false);
    expect(summary.lastRun?.corrupted).toBe(true);
    expect(summary.lastRun?.cacheMisses).toBeGreaterThanOrEqual(1);
  });

  it("tracks file count and duration for benchmark-sized fixtures", () => {
    const files = Object.fromEntries(
      Array.from({ length: 40 }, (_value, index) => {
        const nextImport = index < 39 ? `import { value${index + 1} } from './file-${index + 1}';` : "";
        const nextValue = index < 39 ? `value${index + 1} + ` : "";
        return [
          `src/file-${index}.ts`,
          [nextImport, `export const value${index} = ${nextValue}${index};`, ""].filter(Boolean).join("\n")
        ];
      })
    );
    const rootDir = createTempProject(files);

    analyzeChangedModule(rootDir, "src/file-0.ts");
    const summary = getAnalyzerCacheSummary(rootDir);

    expect(summary.lastRun?.filesSeen).toBe(40);
    expect(summary.fileCount).toBe(40);
    expect(summary.lastRun?.durationMs).toEqual(expect.any(Number));
  });

  it("does not delete cached test artifacts when import graph reads source-only artifacts", () => {
    const rootDir = createTempProject({
      "src/a.ts": "import { b } from './b';\nexport const a = b;\n",
      "src/b.ts": "export const b = 1;\n",
      "src/a.test.ts": "import { a } from './a';\nexpect(a).toBe(1);\n"
    });

    analyzeChangedModule(rootDir);
    const before = getAnalyzerCacheSummary(rootDir);
    buildReverseImportGraph(rootDir);
    const after = getAnalyzerCacheSummary(rootDir);

    expect(before.fileCount).toBe(3);
    expect(after.fileCount).toBe(3);
    expect(after.lastRun?.deletedEntries).toBe(0);
  });
});

function createCacheFixture(): string {
  return createTempProject({
    "src/a.ts": [
      "import { b } from './b';",
      "export function a() {",
      "  return b();",
      "}",
      ""
    ].join("\n"),
    "src/b.ts": [
      "import { c } from './c';",
      "export function b() {",
      "  return c();",
      "}",
      ""
    ].join("\n"),
    "src/c.ts": [
      "export function c() {",
      "  return 'ok';",
      "}",
      ""
    ].join("\n")
  });
}

function analyzeChangedModule(rootDir: string, path = "src/a.ts"): void {
  analyzeSymbolImpacts(rootDir, [change(path, "export function changed() { return 'changed'; }")]);
}

function writeProjectFile(rootDir: string, path: string, content: string): void {
  const fullPath = join(rootDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}
