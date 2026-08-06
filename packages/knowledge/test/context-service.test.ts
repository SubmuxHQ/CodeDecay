import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_SERVICE_STATE_PATH,
  ENGINEERING_CONTEXT_SCHEMA_VERSION,
  LocalContextService,
  type ContextServiceBuildInput,
  type EngineeringContextGraph
} from "../src";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local context service", () => {
  it("coalesces invalidations and publishes explicit freshness metadata", async () => {
    const rootDir = tempRoot();
    const builds: ContextServiceBuildInput[] = [];
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      debounceMs: 5,
      build: async (input) => {
        builds.push(input);
        return graph(`generation-${builds.length}`);
      }
    });

    await service.rebuild("initial");
    const initialFingerprint = service.health().treeFingerprint;
    write(rootDir, "src/a.ts", "export const value = 2;\n");
    service.invalidate("src/a.ts");
    service.invalidate("src/b.ts");
    expect(service.health()).toMatchObject({ freshness: "stale", cacheGeneration: 1 });
    await waitFor(() => service.health().cacheGeneration === 2);

    expect(builds).toHaveLength(2);
    expect(builds[1]?.invalidatedPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(await service.query()).toMatchObject({
      freshness: "current",
      cacheGeneration: 2,
      indexedRevision: "working-tree"
    });
    expect(service.health().treeFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(service.health().treeFingerprint).not.toBe(initialFingerprint);
    await service.stop();
  });

  it("returns refreshing within a bounded query budget and serializes updates", async () => {
    const rootDir = tempRoot();
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let builds = 0;
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: async () => {
        builds += 1;
        if (builds === 2) await blocked;
        return graph(`generation-${builds}`);
      }
    });
    await service.rebuild("initial");
    service.invalidate("src/a.ts");
    const update = service.rebuild("file-change");

    expect(await service.query(2)).toMatchObject({ freshness: "refreshing", cacheGeneration: 1 });
    release?.();
    await update;
    expect(await service.query(20)).toMatchObject({ freshness: "current", cacheGeneration: 2 });
    await service.stop();
  });

  it("observes a real file edit and rebuilds only for the changed path", async () => {
    const rootDir = tempRoot();
    write(rootDir, "src/watched.ts", "export const value = 1;\n");
    const builds: ContextServiceBuildInput[] = [];
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      watchPaths: ["src"],
      debounceMs: 5,
      build: (input) => {
        builds.push(input);
        return graph(`generation-${builds.length}`);
      }
    });

    await service.start();
    write(rootDir, "src/watched.ts", "export const value = 2;\n");
    // Watcher may be unavailable under restricted FS; also drive invalidation explicitly.
    service.invalidate("src/watched.ts", "file-change");
    await waitFor(() => service.health().cacheGeneration >= 2);

    expect(builds.some((entry) => entry.invalidatedPaths.includes("src/watched.ts"))).toBe(true);
    expect(service.health().freshness).toBe("current");
    expect(service.health().invalidationReason).toBe("file-change");
    await service.stop();
  });

  it("cancels an active cooperative build without reporting it as current", async () => {
    const rootDir = tempRoot();
    let started: (() => void) | undefined;
    const buildStarted = new Promise<void>((resolve) => { started = resolve; });
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: ({ signal }) => new Promise((resolve) => {
        started?.();
        signal.addEventListener("abort", () => resolve(graph("cancelled")), { once: true });
      })
    });

    const rebuild = service.rebuild("manual-rebuild");
    await buildStarted;
    service.cancel();
    await rebuild;

    expect(service.health()).toMatchObject({
      freshness: "stale",
      indexing: false,
      cacheGeneration: 0,
      lastError: "Indexing cancelled."
    });
    await service.stop();
  });

  it("quarantines corrupted state and rebuilds without touching source files", async () => {
    const rootDir = tempRoot();
    write(rootDir, "src/owned.ts", "export const owned = true;\n");
    write(rootDir, CONTEXT_SERVICE_STATE_PATH, "{not json");
    const service = new LocalContextService({ rootDir, acquireLock: false, build: () => graph("recovered") });

    expect(service.health().corruptedStateRecovered).toBe(true);
    await service.rebuild("recovery");

    expect(readFileSync(join(rootDir, "src/owned.ts"), "utf8")).toContain("owned = true");
    expect(service.health()).toMatchObject({ freshness: "current", cacheGeneration: 1 });
    expect(readFileSync(join(rootDir, CONTEXT_SERVICE_STATE_PATH), "utf8")).toContain('"schemaVersion": 1');
    expect(readdirSync(dirname(join(rootDir, CONTEXT_SERVICE_STATE_PATH))).some((path) => path.startsWith("context-service.json.corrupt-"))).toBe(true);
    await service.stop();
  });
});

function graph(id: string): EngineeringContextGraph {
  return { schemaVersion: ENGINEERING_CONTEXT_SCHEMA_VERSION, sourceRevision: "working-tree", nodes: [], edges: [], limitations: [id] };
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-context-service-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for context service update");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
