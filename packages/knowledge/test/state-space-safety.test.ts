import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeStateSpaceSafety } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "state-space");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT state-space safety (#688)", () => {
  it("UAT-STATE-1: changed write path leaves stale cache; cold/warm comparison confirms it", () => {
    const root = tempRoot();
    const report = analyzeStateSpaceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "stale-cache.json"),
      generatedAt: "2026-08-06T00:00:00.000Z"
    });
    expect(report.oracle?.combinationResults.find((item) => item.combinationId === "warm")?.status).toBe("failed");
    expect(report.oracle?.combinationResults.find((item) => item.combinationId === "cold")?.status).toBe("passed");
    expect(report.verdict).toBe("confirmed-regression");
    expect(report.fullyVerified).toBe(false);
  });

  it("UAT-STATE-2: two flags pass independently but fail in one pairwise combination", () => {
    const root = tempRoot();
    const report = analyzeStateSpaceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "flag-pair.json")
    });
    expect(report.oracle?.combinationResults.find((item) => item.combinationId === "alpha-on")?.status).toBe("passed");
    expect(report.oracle?.combinationResults.find((item) => item.combinationId === "beta-on")?.status).toBe("passed");
    expect(report.oracle?.combinationResults.find((item) => item.combinationId === "both-on")?.status).toBe("failed");
    expect(report.verdict).toBe("confirmed-regression");
  });

  it("UAT-STATE-3: clean default/off/on matrix passes without unrelated combinations", () => {
    const root = tempRoot();
    const report = analyzeStateSpaceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "clean-matrix.json")
    });
    expect(report.verdict).toBe("passed-oracle");
    expect(report.combinations).toHaveLength(2);
    expect(report.combinations.every((item) => item.selected)).toBe(true);
  });

  it("UAT-STATE-4: report clearly states tested and untested state coverage", () => {
    const root = tempRoot();
    const report = analyzeStateSpaceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "coverage.json")
    });
    expect(report.coverage.exhaustive).toBe(false);
    expect(report.coverage.prunedCount).toBeGreaterThan(0);
    expect(report.coverage.untestedCount).toBeGreaterThan(0);
    expect(report.investigationTasks.join(" ")).toMatch(/Coverage:/);
  });

  it("UAT-STATE-5: remote flag provider is never contacted without explicit configuration", () => {
    const root = tempRoot();
    const report = analyzeStateSpaceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "remote-provider.json")
    });
    expect(report.verdict).toBe("provider-blocked");
    expect(report.safety.remoteFlagProviderContacted).toBe(true);
    expect(report.safety.commandsExecuted).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/Remote flag provider/i);
  });

  it("UAT-STATE-6: repair loop fixes behavior and reruns the same state matrix", () => {
    const root = tempRoot();
    write(root, "src/cache/profile.ts", "export function getProfile() { return cache.get('profile'); /* featureFlag */ }\n");
    const report = analyzeStateSpaceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "repair-loop.json"),
      surfaceFiles: ["src/cache/profile.ts"]
    });
    expect(report.verdict).toBe("passed-oracle");
    expect(report.treeStatus).toBe("revalidated-fixture");
    expect(report.repairTasks.some((task) => task.durableRegressionTestId === "test/cache-invalidation.regression.test.ts")).toBe(true);
    expect(report.candidates.some((item) => item.kind === "cache-state" || item.kind === "feature-flag")).toBe(true);
    expect(report.extensionBoundaries.map((item) => item.id)).toEqual(
      expect.arrayContaining(["launchdarkly", "unleash", "redis-cache", "config-flags"])
    );
  });
});

function tempRoot(): string {
  const root = join(tmpdir(), `codedecay-state-space-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, "utf8");
}
