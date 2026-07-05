import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SymbolCall, SymbolExport, SymbolImport } from "@submuxhq/codedecay-core";
import { isTestPath } from "../classifiers/paths";

export const ANALYZER_CACHE_PATH = ".codedecay/local/analyzer-js-cache.json";
const CACHE_SCHEMA_VERSION = 1;

export interface AnalyzerCachedFileArtifacts {
  path: string;
  role: "source" | "test";
  exports: SymbolExport[];
  imports: SymbolImport[];
  calls: SymbolCall[];
  localImportSpecifiers: string[];
  isRouteFile: boolean;
  symbolsComplete: boolean;
}

export interface AnalyzerArtifactParserResult {
  exports: SymbolExport[];
  imports: SymbolImport[];
  calls: SymbolCall[];
  localImportSpecifiers: string[];
  isRouteFile: boolean;
  symbolsComplete: boolean;
}

export interface AnalyzerCacheReadOptions {
  rootDir: string;
  files: string[];
  currentFiles?: string[] | undefined;
  requireSymbols: boolean;
  parse(path: string, content: string): AnalyzerArtifactParserResult;
}

export interface AnalyzerCacheReadResult {
  files: AnalyzerCachedFileArtifacts[];
  stats: AnalyzerCacheRunStats;
}

export interface AnalyzerCacheRunStats {
  filesSeen: number;
  cacheHits: number;
  cacheMisses: number;
  hashValidatedHits: number;
  staleEntries: number;
  deletedEntries: number;
  corrupted: boolean;
  durationMs: number;
}

export interface AnalyzerCacheSummary {
  path: string;
  absolutePath: string;
  exists: boolean;
  schemaVersion?: number | undefined;
  fileCount: number;
  updatedAt?: string | undefined;
  lastRun?: AnalyzerCacheRunStats | undefined;
  corrupted: boolean;
  error?: string | undefined;
}

interface AnalyzerCacheDocument {
  schemaVersion: 1;
  updatedAt: string;
  files: Record<string, AnalyzerCacheFileEntry>;
  lastRun?: AnalyzerCacheRunStats | undefined;
}

interface AnalyzerCacheFileEntry extends AnalyzerCachedFileArtifacts {
  size: number;
  mtimeMs: number;
  contentHash: string;
}

interface LoadedAnalyzerCache {
  document: AnalyzerCacheDocument;
  corrupted: boolean;
}

export function readCachedAnalyzerArtifacts(options: AnalyzerCacheReadOptions): AnalyzerCacheReadResult {
  const startedAt = Date.now();
  const normalizedFiles = [...new Set(options.files.map(normalizePath))].sort((left, right) => left.localeCompare(right));
  const normalizedCurrentFiles = [...new Set((options.currentFiles ?? options.files).map(normalizePath))].sort((left, right) =>
    left.localeCompare(right)
  );
  const loaded = loadAnalyzerCache(options.rootDir);
  const document = loaded.document;
  const currentFileSet = new Set(normalizedCurrentFiles);
  const artifacts: AnalyzerCachedFileArtifacts[] = [];
  const stats: AnalyzerCacheRunStats = {
    filesSeen: normalizedFiles.length,
    cacheHits: 0,
    cacheMisses: 0,
    hashValidatedHits: 0,
    staleEntries: 0,
    deletedEntries: 0,
    corrupted: loaded.corrupted,
    durationMs: 0
  };

  for (const cachedPath of Object.keys(document.files)) {
    if (!currentFileSet.has(cachedPath)) {
      delete document.files[cachedPath];
      stats.deletedEntries += 1;
    }
  }

  for (const path of normalizedFiles) {
    const metadata = statRepoFile(options.rootDir, path);
    if (!metadata) {
      delete document.files[path];
      stats.deletedEntries += 1;
      continue;
    }

    const cached = document.files[path];
    const canUseByMetadata =
      cached &&
      cached.size === metadata.size &&
      cached.mtimeMs === metadata.mtimeMs &&
      (!options.requireSymbols || cached.symbolsComplete);
    if (canUseByMetadata) {
      artifacts.push(cloneArtifacts(cached));
      stats.cacheHits += 1;
      continue;
    }

    const content = readRepoFile(options.rootDir, path);
    if (content === undefined) {
      delete document.files[path];
      stats.deletedEntries += 1;
      continue;
    }

    const contentHash = hashContent(content);
    const canUseByHash =
      cached &&
      cached.contentHash === contentHash &&
      (!options.requireSymbols || cached.symbolsComplete);
    if (canUseByHash) {
      const refreshed = {
        ...cached,
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
        contentHash
      };
      document.files[path] = refreshed;
      artifacts.push(cloneArtifacts(refreshed));
      stats.cacheHits += 1;
      stats.hashValidatedHits += 1;
      continue;
    }

    const parsed = options.parse(path, content);
    const entry: AnalyzerCacheFileEntry = {
      path,
      role: isTestPath(path) ? "test" : "source",
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      contentHash,
      exports: parsed.exports,
      imports: parsed.imports.map(({ sourceFile: _sourceFile, ...item }) => item),
      calls: parsed.calls,
      localImportSpecifiers: parsed.localImportSpecifiers,
      isRouteFile: parsed.isRouteFile,
      symbolsComplete: parsed.symbolsComplete
    };
    document.files[path] = entry;
    artifacts.push(cloneArtifacts(entry));
    stats.cacheMisses += 1;
    if (cached) {
      stats.staleEntries += 1;
    }
  }

  stats.durationMs = Date.now() - startedAt;
  document.updatedAt = new Date().toISOString();
  document.lastRun = stats;
  saveAnalyzerCache(options.rootDir, document);

  return {
    files: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
    stats
  };
}

export function getAnalyzerCacheSummary(rootDir: string): AnalyzerCacheSummary {
  const absolutePath = cacheAbsolutePath(rootDir);
  if (!absolutePath || !existsSync(absolutePath)) {
    return {
      path: ANALYZER_CACHE_PATH,
      absolutePath: absolutePath ?? join(rootDir, ANALYZER_CACHE_PATH),
      exists: false,
      fileCount: 0,
      corrupted: false
    };
  }

  try {
    const document = parseCacheDocument(readFileSync(absolutePath, "utf8"));
    return {
      path: ANALYZER_CACHE_PATH,
      absolutePath,
      exists: true,
      schemaVersion: document.schemaVersion,
      fileCount: Object.keys(document.files).length,
      updatedAt: document.updatedAt,
      lastRun: document.lastRun,
      corrupted: false
    };
  } catch (error: unknown) {
    return {
      path: ANALYZER_CACHE_PATH,
      absolutePath,
      exists: true,
      fileCount: 0,
      corrupted: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function loadAnalyzerCache(rootDir: string): LoadedAnalyzerCache {
  const absolutePath = cacheAbsolutePath(rootDir);
  if (!absolutePath || !existsSync(absolutePath)) {
    return {
      document: createEmptyCacheDocument(),
      corrupted: false
    };
  }

  try {
    return {
      document: parseCacheDocument(readFileSync(absolutePath, "utf8")),
      corrupted: false
    };
  } catch {
    return {
      document: createEmptyCacheDocument(),
      corrupted: true
    };
  }
}

function saveAnalyzerCache(rootDir: string, document: AnalyzerCacheDocument): void {
  const absolutePath = cacheAbsolutePath(rootDir);
  if (!absolutePath) {
    return;
  }

  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  } catch {
    // Analysis should not fail just because local cache writes are unavailable.
  }
}

function parseCacheDocument(raw: string): AnalyzerCacheDocument {
  const parsed = JSON.parse(raw) as Partial<AnalyzerCacheDocument>;
  if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION || !parsed.files || typeof parsed.files !== "object") {
    throw new Error("Invalid analyzer cache schema.");
  }

  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    files: normalizeCacheFiles(parsed.files),
    lastRun: normalizeRunStats(parsed.lastRun)
  };
}

function normalizeCacheFiles(files: Record<string, unknown>): Record<string, AnalyzerCacheFileEntry> {
  const normalized: Record<string, AnalyzerCacheFileEntry> = {};
  for (const [path, value] of Object.entries(files)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const candidate = value as Partial<AnalyzerCacheFileEntry>;
    if (
      typeof candidate.path !== "string" ||
      typeof candidate.size !== "number" ||
      typeof candidate.mtimeMs !== "number" ||
      typeof candidate.contentHash !== "string"
    ) {
      continue;
    }

    normalized[normalizePath(path)] = {
      path: normalizePath(candidate.path),
      role: candidate.role === "test" ? "test" : "source",
      size: candidate.size,
      mtimeMs: candidate.mtimeMs,
      contentHash: candidate.contentHash,
      exports: Array.isArray(candidate.exports) ? candidate.exports : [],
      imports: Array.isArray(candidate.imports) ? candidate.imports : [],
      calls: Array.isArray(candidate.calls) ? candidate.calls : [],
      localImportSpecifiers: Array.isArray(candidate.localImportSpecifiers) ? candidate.localImportSpecifiers : [],
      isRouteFile: candidate.isRouteFile === true,
      symbolsComplete: candidate.symbolsComplete === true
    };
  }

  return normalized;
}

function normalizeRunStats(stats: AnalyzerCacheRunStats | undefined): AnalyzerCacheRunStats | undefined {
  if (!stats) {
    return undefined;
  }

  return {
    filesSeen: numberOrZero(stats.filesSeen),
    cacheHits: numberOrZero(stats.cacheHits),
    cacheMisses: numberOrZero(stats.cacheMisses),
    hashValidatedHits: numberOrZero(stats.hashValidatedHits),
    staleEntries: numberOrZero(stats.staleEntries),
    deletedEntries: numberOrZero(stats.deletedEntries),
    corrupted: stats.corrupted === true,
    durationMs: numberOrZero(stats.durationMs)
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createEmptyCacheDocument(): AnalyzerCacheDocument {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    files: {}
  };
}

function statRepoFile(rootDir: string, path: string): { size: number; mtimeMs: number } | undefined {
  const fullPath = resolveInsideRoot(rootDir, path);
  if (!fullPath) {
    return undefined;
  }

  try {
    const stats = statSync(fullPath);
    return stats.isFile() ? { size: stats.size, mtimeMs: stats.mtimeMs } : undefined;
  } catch {
    return undefined;
  }
}

function readRepoFile(rootDir: string, path: string): string | undefined {
  const fullPath = resolveInsideRoot(rootDir, path);
  if (!fullPath) {
    return undefined;
  }

  try {
    return readFileSync(fullPath, "utf8");
  } catch {
    return undefined;
  }
}

function cacheAbsolutePath(rootDir: string): string | undefined {
  return resolveInsideRoot(rootDir, ANALYZER_CACHE_PATH);
}

function resolveInsideRoot(rootDir: string, repoPath: string): string | undefined {
  const rootPath = resolve(rootDir);
  const fullPath = resolve(rootPath, repoPath);
  const relativePath = relative(rootPath, fullPath);
  return relativePath.startsWith("..") || isAbsolute(relativePath) ? undefined : fullPath;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function cloneArtifacts(entry: AnalyzerCacheFileEntry): AnalyzerCachedFileArtifacts {
  return {
    path: entry.path,
    role: entry.role,
    exports: entry.exports.map((item) => ({ ...item })),
    imports: entry.imports.map((item) => ({ ...item })),
    calls: entry.calls.map((item) => ({ ...item })),
    localImportSpecifiers: [...entry.localImportSpecifiers],
    isRouteFile: entry.isRouteFile,
    symbolsComplete: entry.symbolsComplete
  };
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
