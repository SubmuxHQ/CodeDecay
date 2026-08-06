import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_SERVICE_STATE_PATH,
  acquireContextServiceLock,
  createDefaultContextServiceBuild,
  LocalContextService,
  runContextServiceToolLike
} from "./helpers/context-service-uat";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT local context service (#682)", () => {
  it("UAT-INDEX-1: start service, query, edit file, next response references new tree", async () => {
    const rootDir = tempRepo();
    write(rootDir, "src/a.ts", "export const a = 1;\n");
    const builder = createDefaultContextServiceBuild();
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: (input) => builder.build(input),
      getBuildStats: () => builder.stats()
    });

    await service.start();
    const before = await service.query();
    write(rootDir, "src/a.ts", "export const a = 2;\n");
    service.invalidate("src/a.ts", "file-change");
    await waitFor(() => service.health().cacheGeneration > before.cacheGeneration);
    const after = await service.query({ waitBudgetMs: 200 });

    expect(after.freshness).toBe("current");
    expect(after.treeFingerprint).not.toBe(before.treeFingerprint);
    expect(after.cacheGeneration).toBeGreaterThan(before.cacheGeneration);
    await service.stop();
  });

  it("UAT-INDEX-2: unrelated file edits do not force a full graph rebuild", async () => {
    const rootDir = tempRepo();
    write(rootDir, "src/keep.ts", "export const keep = true;\n");
    write(rootDir, "src/touch.ts", "export const touch = 1;\n");
    const builder = createDefaultContextServiceBuild();
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: (input) => builder.build(input),
      getBuildStats: () => builder.stats()
    });

    await service.rebuild("initial");
    expect(builder.stats()?.mode).toBe("full");
    service.invalidate("src/touch.ts", "file-change");
    await service.rebuild("file-change");
    expect(builder.stats()?.mode).toBe("incremental");
    expect(builder.stats()?.invalidatedPaths).toEqual(["src/touch.ts"]);
    await service.stop();
  });

  it("UAT-INDEX-3: rename/delete/git HEAD invalidations update required context", async () => {
    const rootDir = tempRepo();
    write(rootDir, "src/old.ts", "export const old = 1;\n");
    const builder = createDefaultContextServiceBuild();
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: (input) => builder.build(input),
      getBuildStats: () => builder.stats()
    });
    await service.rebuild("initial");

    renameSync(join(rootDir, "src/old.ts"), join(rootDir, "src/new.ts"));
    service.invalidate("src/old.ts", "file-change");
    service.invalidate("src/new.ts", "file-change");
    await service.rebuild("file-change");
    expect(service.health().invalidatedPaths).toEqual(["src/new.ts", "src/old.ts"]);

    service.invalidate(".git/HEAD", "git-change");
    await service.rebuild("git-change");
    expect(builder.stats()?.mode).toBe("full");
    await service.stop();
  });

  it("UAT-INDEX-4: corrupted cache recovers with visible status", async () => {
    const rootDir = tempRepo();
    write(rootDir, "src/owned.ts", "export const owned = true;\n");
    write(rootDir, CONTEXT_SERVICE_STATE_PATH, "{broken");
    const builder = createDefaultContextServiceBuild();
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: (input) => builder.build(input),
      getBuildStats: () => builder.stats()
    });

    expect(service.health().corruptedStateRecovered).toBe(true);
    await service.reset();
    expect(service.health()).toMatchObject({ freshness: "current", invalidationReason: "recovery" });
    expect(readFileSync(join(rootDir, "src/owned.ts"), "utf8")).toContain("owned = true");
    await service.stop();
  });

  it("UAT-INDEX-5: concurrent sessions share index and isolate task state", async () => {
    const rootDir = tempRepo();
    write(rootDir, "src/shared.ts", "export const shared = 1;\n");
    const builder = createDefaultContextServiceBuild();
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: (input) => builder.build(input),
      getBuildStats: () => builder.stats()
    });
    await service.rebuild("initial");

    const left = await service.query({ sessionId: "agent-a", task: "fix payouts" });
    const right = await service.query({ sessionId: "agent-b", task: "fix auth" });
    expect(left.treeFingerprint).toBe(right.treeFingerprint);
    expect(left.task).toBe("fix payouts");
    expect(right.task).toBe("fix auth");
    expect(service.health().activeSessions).toBe(2);

    const leftAgain = await service.query({ sessionId: "agent-a" });
    expect(leftAgain.task).toBe("fix payouts");
    await service.stop();
  });

  it("process lock prevents a second writer and MCP health/query share decisions", async () => {
    const rootDir = tempRepo();
    const lock = acquireContextServiceLock(rootDir);
    expect(() => acquireContextServiceLock(rootDir)).toThrow(/lock is held/);
    lock.release();

    const health = JSON.parse(await runContextServiceToolLike(rootDir, { operation: "health" })) as {
      freshness: string;
      repositoryId: string;
    };
    const query = JSON.parse(
      await runContextServiceToolLike(rootDir, { operation: "query", sessionId: "mcp-1", task: "index check" })
    ) as { freshness: string; repositoryId: string; task?: string };
    expect(health.repositoryId).toBe(query.repositoryId);
    expect(query.task).toBe("index check");
  });

  it("records performance budgets for cold and one-file updates", async () => {
    const rootDir = tempRepo();
    for (let index = 0; index < 20; index += 1) {
      write(rootDir, `src/file-${index}.ts`, `export const value${index} = ${index};\n`);
    }
    const builder = createDefaultContextServiceBuild();
    const service = new LocalContextService({
      rootDir,
      acquireLock: false,
      build: (input) => builder.build(input),
      getBuildStats: () => builder.stats()
    });
    await service.rebuild("initial");
    const cold = builder.stats();
    service.invalidate("src/file-1.ts", "file-change");
    await service.rebuild("file-change");
    const oneFile = builder.stats();

    expect(cold?.mode).toBe("full");
    expect(oneFile?.mode).toBe("incremental");
    expect(cold!.durationMs).toBeLessThan(5_000);
    expect(oneFile!.durationMs).toBeLessThan(5_000);
    await service.stop();
  });
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-index-uat-"));
  roots.push(root);
  execFileSync("git", ["-C", root, "init", "-b", "main"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.name", "Test"], { stdio: "ignore" });
  write(root, "README.md", "# fixture\n");
  execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "commit", "-m", "init"], { stdio: "ignore" });
  return root;
}

function write(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for context service update");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
