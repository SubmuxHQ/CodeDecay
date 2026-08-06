import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeConcurrencySafety } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "concurrency");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT concurrency safety (#687)", () => {
  it("UAT-CONCURRENCY-1: duplicate delivery causes two side effects and is confirmed", () => {
    const root = tempRoot();
    const report = analyzeConcurrencySafety({
      rootDir: root,
      experimentFile: join(fixtures, "duplicate-delivery.json"),
      cleanupPlan: "reset fixture side-effect counter",
      generatedAt: "2026-08-06T00:00:00.000Z"
    });
    expect(report.oracle?.sideEffectCount).toBe(2);
    expect(report.verdict).toBe("confirmed-race");
    expect(report.fullyVerified).toBe(false);
    expect(report.safety.commandsExecuted).toBe(false);
  });

  it("UAT-CONCURRENCY-2: concurrent updates expose a lost-update defect with a deterministic barrier", () => {
    const root = tempRoot();
    const report = analyzeConcurrencySafety({
      rootDir: root,
      experimentFile: join(fixtures, "lost-update.json")
    });
    expect(report.oracle?.finalState).toBe(1);
    expect(report.oracle?.timeline.every((event) => event.barrier === "shared-read")).toBe(true);
    expect(report.verdict).toBe("confirmed-race");
    expect(report.invariant).toBe("no-lost-update");
  });

  it("UAT-CONCURRENCY-3: an idempotent implementation passes the same oracle without false failure", () => {
    const root = tempRoot();
    const report = analyzeConcurrencySafety({
      rootDir: root,
      experimentFile: join(fixtures, "idempotent.json")
    });
    expect(report.oracle?.sideEffectCount).toBe(1);
    expect(report.verdict).toBe("passed-oracle");
    expect(report.fullyVerified).toBe(false);
  });

  it("UAT-CONCURRENCY-4: an inconclusive stress-only result cannot become verified safety", () => {
    const root = tempRoot();
    const report = analyzeConcurrencySafety({
      rootDir: root,
      experimentFile: join(fixtures, "stress-only.json")
    });
    expect(report.verdict).toBe("inconclusive-stress");
    expect(report.experimentKind).toBe("probabilistic-stress");
    expect(report.fullyVerified).toBe(false);
    expect(report.limitations.join(" ")).toMatch(/cannot become verified/i);
  });

  it("UAT-CONCURRENCY-5: parallelism, repetitions, timeout, network target, and cleanup stay inside configured bounds", () => {
    const root = tempRoot();
    const report = analyzeConcurrencySafety({
      rootDir: root,
      experimentFile: join(fixtures, "bounds-blocked.json")
    });
    expect(report.verdict).toBe("bounds-blocked");
    expect(report.boundsBlocked).toBe(true);
    expect(report.safety.commandsExecuted).toBe(false);
    expect(report.safety.networkCalled).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/maxParallelism|repetitions|timeoutMs|Network target/i);
  });

  it("UAT-CONCURRENCY-6: the repair loop adds a durable regression test and revalidates the final tree", () => {
    const root = tempRoot();
    write(root, "src/jobs/payout.ts", "export async function processJob() { /* retry queue idempotencyKey */ }\n");
    const report = analyzeConcurrencySafety({
      rootDir: root,
      experimentFile: join(fixtures, "repair-loop.json"),
      surfaceFiles: ["src/jobs/payout.ts"]
    });
    expect(report.verdict).toBe("confirmed-race");
    expect(report.repairTasks.some((task) => task.durableRegressionTestId === "test/idempotency.regression.test.ts")).toBe(true);
    expect(report.treeStatus).toBe("revalidated-fixture");
    expect(report.candidates.some((item) => item.kind === "job" || item.kind === "idempotency-key" || item.kind === "retry")).toBe(true);
    expect(report.extensionBoundaries.map((item) => item.id)).toEqual(
      expect.arrayContaining(["queues", "webhooks", "cron-jobs", "distributed-locks", "transactional-outbox"])
    );
  });
});

function tempRoot(): string {
  const root = join(tmpdir(), `codedecay-concurrency-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, "utf8");
}
