import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { EngineeringContextGraph } from "./types";
import { resolveGitSourceRevision } from "./context";
import { acquireContextServiceLock, type ContextServiceLockHandle } from "./service-lock";
import type { ContextServiceBuildStats } from "./service-build";

export const CONTEXT_SERVICE_STATE_PATH = ".codedecay/local/context-service.json";
export const CONTEXT_SERVICE_SCHEMA_VERSION = 1 as const;

export type ContextServiceFreshness = "current" | "refreshing" | "stale";
export type ContextInvalidationReason = "initial" | "file-change" | "git-change" | "manual-rebuild" | "recovery";

export interface ContextServiceMetadata {
  repositoryId: string;
  rootDir: string;
  indexedRevision: string;
  treeFingerprint: string;
  freshness: ContextServiceFreshness;
  cacheGeneration: number;
}

export interface ContextServiceHealth extends ContextServiceMetadata {
  schemaVersion: typeof CONTEXT_SERVICE_SCHEMA_VERSION;
  indexing: boolean;
  invalidationReason: ContextInvalidationReason;
  invalidatedPaths: string[];
  lastIndexedAt?: string | undefined;
  lastError?: string | undefined;
  corruptedStateRecovered: boolean;
  lockPath?: string | undefined;
  lastBuild?: ContextServiceBuildStats | undefined;
  activeSessions: number;
}

export interface ContextServiceQueryResult extends ContextServiceMetadata {
  graph?: EngineeringContextGraph | undefined;
  sessionId?: string | undefined;
  task?: string | undefined;
}

export interface ContextServiceBuildInput {
  rootDir: string;
  invalidatedPaths: string[];
  reason: ContextInvalidationReason;
  signal: AbortSignal;
}

export interface LocalContextServiceOptions {
  rootDir: string;
  build(input: ContextServiceBuildInput): Promise<EngineeringContextGraph> | EngineeringContextGraph;
  watchPaths?: string[] | undefined;
  ignored?: Array<string | RegExp> | undefined;
  debounceMs?: number | undefined;
  statePath?: string | undefined;
  lockPath?: string | undefined;
  acquireLock?: boolean | undefined;
  getBuildStats?: (() => ContextServiceBuildStats | undefined) | undefined;
  now?: (() => Date) | undefined;
}

interface PersistedContextServiceState {
  schemaVersion: typeof CONTEXT_SERVICE_SCHEMA_VERSION;
  repositoryId: string;
  indexedRevision: string;
  treeFingerprint: string;
  cacheGeneration: number;
  lastIndexedAt: string;
}

interface SessionState {
  task?: string | undefined;
  updatedAt: string;
}

export class LocalContextService {
  private readonly rootDir: string;
  private readonly repositoryId: string;
  private readonly statePath: string;
  private readonly now: () => Date;
  private watcher: FSWatcher | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private updateChain: Promise<void> = Promise.resolve();
  private activeUpdate: Promise<void> | undefined;
  private abortController: AbortController | undefined;
  private graph: EngineeringContextGraph | undefined;
  private pendingPaths = new Set<string>();
  private corruptedStateRecovered = false;
  private lock: ContextServiceLockHandle | undefined;
  private sessions = new Map<string, SessionState>();
  private lastBuild: ContextServiceBuildStats | undefined;
  private state: ContextServiceHealth;

  constructor(private readonly options: LocalContextServiceOptions) {
    this.rootDir = realpathOrResolve(options.rootDir);
    this.repositoryId = hash([this.rootDir]);
    this.statePath = resolve(this.rootDir, options.statePath ?? CONTEXT_SERVICE_STATE_PATH);
    this.now = options.now ?? (() => new Date());
    const recovered = this.loadState();
    this.state = {
      schemaVersion: CONTEXT_SERVICE_SCHEMA_VERSION,
      repositoryId: this.repositoryId,
      rootDir: this.rootDir,
      indexedRevision: recovered?.indexedRevision ?? resolveGitSourceRevision(this.rootDir),
      treeFingerprint: recovered?.treeFingerprint ?? "unindexed",
      freshness: "stale",
      cacheGeneration: recovered?.cacheGeneration ?? 0,
      indexing: false,
      invalidationReason: recovered ? "initial" : "recovery",
      invalidatedPaths: [],
      lastIndexedAt: recovered?.lastIndexedAt,
      corruptedStateRecovered: this.corruptedStateRecovered,
      activeSessions: 0
    };
  }

  async start(): Promise<void> {
    this.ensureLock();
    await this.rebuild("initial");
    const targets = this.options.watchPaths ?? [this.rootDir];
    this.watcher = watch(targets, {
      cwd: this.rootDir,
      ignoreInitial: true,
      ignored: [/(^|[/\\])\.git[/\\](?!HEAD$)/, /(^|[/\\])\.codedecay[/\\]local[/\\]/, ...(this.options.ignored ?? [])],
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 }
    });
    this.watcher.on("all", (_event, path) => this.invalidate(path, isGitPath(path) ? "git-change" : "file-change"));
    await new Promise<void>((resolveReady, rejectReady) => {
      this.watcher?.once("ready", resolveReady);
      this.watcher?.once("error", rejectReady);
    });
  }

  invalidate(path: string, reason: ContextInvalidationReason = "file-change"): void {
    this.pendingPaths.add(normalizePath(path));
    this.state = {
      ...this.state,
      freshness: this.state.indexing ? "refreshing" : "stale",
      invalidationReason: reason,
      invalidatedPaths: [...this.pendingPaths].sort()
    };
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.rebuild(reason), this.options.debounceMs ?? 75);
  }

  rebuild(reason: ContextInvalidationReason = "manual-rebuild"): Promise<void> {
    this.ensureLock();
    const run = async (): Promise<void> => {
      const invalidatedPaths = [...this.pendingPaths].sort();
      this.pendingPaths.clear();
      this.abortController = new AbortController();
      this.state = { ...this.state, freshness: "refreshing", indexing: true, invalidationReason: reason, invalidatedPaths };
      try {
        const graph = await this.options.build({
          rootDir: this.rootDir,
          invalidatedPaths,
          reason,
          signal: this.abortController.signal
        });
        if (this.abortController.signal.aborted) return;
        const indexedRevision = resolveGitSourceRevision(this.rootDir);
        const treeFingerprint = fingerprintGeneration(
          this.rootDir,
          this.state.treeFingerprint,
          graph,
          indexedRevision,
          invalidatedPaths
        );
        this.graph = graph;
        this.lastBuild = this.options.getBuildStats?.();
        this.state = {
          ...this.state,
          indexedRevision,
          treeFingerprint,
          freshness: this.pendingPaths.size > 0 ? "stale" : "current",
          cacheGeneration: this.state.cacheGeneration + 1,
          indexing: false,
          invalidatedPaths,
          lastIndexedAt: this.now().toISOString(),
          lastError: undefined,
          lastBuild: this.lastBuild
        };
        this.persistState();
      } catch (error: unknown) {
        this.state = {
          ...this.state,
          freshness: "stale",
          indexing: false,
          lastError: error instanceof Error ? error.message : String(error)
        };
      } finally {
        if (this.abortController?.signal.aborted) {
          this.state = {
            ...this.state,
            freshness: "stale",
            indexing: false,
            lastError: "Indexing cancelled."
          };
        }
        this.abortController = undefined;
      }
    };
    this.updateChain = this.updateChain.then(run, run);
    this.activeUpdate = this.updateChain;
    return this.updateChain;
  }

  async query(
    waitBudgetMsOrInput:
      | number
      | { waitBudgetMs?: number | undefined; sessionId?: string | undefined; task?: string | undefined } = 0
  ): Promise<ContextServiceQueryResult> {
    const input =
      typeof waitBudgetMsOrInput === "number"
        ? { waitBudgetMs: waitBudgetMsOrInput }
        : waitBudgetMsOrInput;
    const waitBudgetMs = input.waitBudgetMs ?? 0;
    if (this.activeUpdate && this.state.freshness !== "current" && waitBudgetMs > 0) {
      await Promise.race([this.activeUpdate, delay(waitBudgetMs)]);
    }
    let sessionId = input.sessionId;
    let task = input.task;
    if (sessionId) {
      const existing = this.sessions.get(sessionId) ?? { updatedAt: this.now().toISOString() };
      if (task) {
        existing.task = task;
      }
      existing.updatedAt = this.now().toISOString();
      this.sessions.set(sessionId, existing);
      task = existing.task;
      this.state = { ...this.state, activeSessions: this.sessions.size };
    }
    return {
      ...metadata(this.state),
      graph: this.graph,
      sessionId,
      task
    };
  }

  health(): ContextServiceHealth {
    return {
      ...this.state,
      invalidatedPaths: [...this.state.invalidatedPaths],
      lastBuild: this.lastBuild,
      activeSessions: this.sessions.size
    };
  }

  reset(): Promise<void> {
    this.graph = undefined;
    this.sessions.clear();
    this.pendingPaths.clear();
    this.state = {
      ...this.state,
      freshness: "stale",
      cacheGeneration: 0,
      treeFingerprint: "unindexed",
      activeSessions: 0,
      invalidationReason: "recovery",
      invalidatedPaths: []
    };
    return this.rebuild("recovery");
  }

  cancel(): void {
    this.abortController?.abort();
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.cancel();
    await this.watcher?.close();
    await this.updateChain;
    this.lock?.release();
    this.lock = undefined;
  }

  private ensureLock(): void {
    if (this.lock || this.options.acquireLock === false) {
      return;
    }
    this.lock = acquireContextServiceLock(this.rootDir, { lockPath: this.options.lockPath });
    this.state = { ...this.state, lockPath: this.lock.path };
  }

  private loadState(): PersistedContextServiceState | undefined {
    if (!existsSync(this.statePath)) return undefined;
    try {
      const value = JSON.parse(readFileSync(this.statePath, "utf8")) as PersistedContextServiceState;
      if (value.schemaVersion !== CONTEXT_SERVICE_SCHEMA_VERSION || value.repositoryId !== this.repositoryId) {
        throw new Error("incompatible context service state");
      }
      return value;
    } catch {
      this.corruptedStateRecovered = true;
      const quarantine = `${this.statePath}.corrupt-${Date.now()}`;
      try {
        renameSync(this.statePath, quarantine);
      } catch {
        /* Rebuild still proceeds when quarantine is unavailable. */
      }
      return undefined;
    }
  }

  private persistState(): void {
    const document: PersistedContextServiceState = {
      schemaVersion: CONTEXT_SERVICE_SCHEMA_VERSION,
      repositoryId: this.repositoryId,
      indexedRevision: this.state.indexedRevision,
      treeFingerprint: this.state.treeFingerprint,
      cacheGeneration: this.state.cacheGeneration,
      lastIndexedAt: this.state.lastIndexedAt ?? this.now().toISOString()
    };
    mkdirSync(dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.statePath);
  }
}

function metadata(state: ContextServiceHealth): ContextServiceMetadata {
  const { repositoryId, rootDir, indexedRevision, treeFingerprint, freshness, cacheGeneration } = state;
  return { repositoryId, rootDir, indexedRevision, treeFingerprint, freshness, cacheGeneration };
}

function fingerprintGeneration(
  rootDir: string,
  previous: string,
  graph: EngineeringContextGraph,
  revision: string,
  invalidatedPaths: string[]
): string {
  if (invalidatedPaths.length === 0) {
    return hash([revision, JSON.stringify(graph)]);
  }
  return hash([previous, revision, ...invalidatedPaths.flatMap((path) => fileFingerprint(rootDir, path))]);
}

function fileFingerprint(rootDir: string, path: string): string[] {
  const absolutePath = resolve(rootDir, path);
  try {
    const stats = statSync(absolutePath);
    if (!stats.isFile()) return [path, stats.isDirectory() ? "directory" : "non-file", String(stats.mtimeMs)];
    return [path, String(stats.size), String(stats.mtimeMs), hash([readFileSync(absolutePath, "utf8")])];
  } catch {
    return [path, "deleted"];
  }
}

function hash(parts: string[]): string {
  return `sha256:${createHash("sha256").update(parts.join("\0")).digest("hex")}`;
}

function realpathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isGitPath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === ".git/HEAD" || normalized.startsWith(".git/refs/") || normalized === ".git/index";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
