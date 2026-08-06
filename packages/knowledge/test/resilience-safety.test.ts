import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeResilienceSafety } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "resilience");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT resilience safety (#689)", () => {
  it("UAT-RESILIENCE-1: dependency timeout causes unsafe repeated side effects", () => {
    const report = analyzeResilienceSafety({
      rootDir: tempRoot(),
      experimentFile: join(fixtures, "timeout-retries.json")
    });
    expect(report.cellResults[0]?.sideEffectCount).toBeGreaterThan(1);
    expect(report.verdict).toBe("confirmed-defect");
    expect(report.fullyVerified).toBe(false);
  });

  it("UAT-RESILIENCE-2: old consumer cannot parse new producer during rolling deploy", () => {
    const report = analyzeResilienceSafety({
      rootDir: tempRoot(),
      experimentFile: join(fixtures, "mixed-version.json")
    });
    expect(report.cellResults.find((r) => r.cellId === "new-old")?.status).toBe("failed");
    expect(report.verdict).toBe("confirmed-defect");
  });

  it("UAT-RESILIENCE-3: correct fallback and recovery passes the same fault profile", () => {
    const report = analyzeResilienceSafety({
      rootDir: tempRoot(),
      experimentFile: join(fixtures, "fallback.json")
    });
    expect(report.verdict).toBe("passed-oracle");
    expect(report.cellResults.every((r) => r.status === "passed")).toBe(true);
  });

  it("UAT-RESILIENCE-4: retry bounds are enforced even when app retries indefinitely", () => {
    const report = analyzeResilienceSafety({
      rootDir: tempRoot(),
      experimentFile: join(fixtures, "bounds.json")
    });
    expect(report.cellResults[0]?.retryCount).toBe(3);
    expect(report.verdict).toBe("confirmed-defect");
    expect(report.safety.commandsExecuted).toBe(false);
  });

  it("UAT-RESILIENCE-5: production or ambiguous targets are blocked", () => {
    const report = analyzeResilienceSafety({
      rootDir: tempRoot(),
      experimentFile: join(fixtures, "prod-target.json")
    });
    expect(report.verdict).toBe("target-blocked");
    expect(report.safety.chaosInjected).toBe(false);
  });

  it("UAT-RESILIENCE-6: final repair is reverified under happy/fault/mixed-version paths", () => {
    const root = tempRoot();
    write(root, "src/clients/payments.ts", "export async function pay() { return fetch('/pay', { signal: AbortSignal.timeout(1000) }); }\n");
    const report = analyzeResilienceSafety({
      rootDir: root,
      experimentFile: join(fixtures, "repair-loop.json"),
      surfaceFiles: ["src/clients/payments.ts"]
    });
    expect(report.verdict).toBe("passed-oracle");
    expect(report.treeStatus).toBe("revalidated-fixture");
    expect(report.repairTasks.some((t) => t.durableRegressionTestId === "test/resilience.regression.test.ts")).toBe(true);
    expect(report.candidates.some((c) => c.suggestedFault === "timeout")).toBe(true);
    expect(report.extensionBoundaries.map((b) => b.id)).toEqual(
      expect.arrayContaining(["toxiproxy", "testcontainers", "service-virtualization", "contract-tools"])
    );
  });
});

function tempRoot(): string {
  const root = join(tmpdir(), `codedecay-resilience-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, "utf8");
}
