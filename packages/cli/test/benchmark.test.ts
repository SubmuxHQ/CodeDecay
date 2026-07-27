import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBenchmark, type BenchmarkReport } from "../src/benchmark/run";
import { runCli } from "../src/index";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const tempRoots: string[] = [];
const BENCHMARK_RUNTIME_BUDGET_MS = 15_000;
const BENCHMARK_CONTRACT_TIMEOUT_MS = 20_000;

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("codedecay benchmark CLI contract", () => {
  it("renders real deterministic benchmark metrics as JSON", async () => {
    const result = await run(["benchmark", "--format", "json"]);
    const report = JSON.parse(result.stdout) as BenchmarkReport;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.corpus).toBe("default");
    expect(report.summary).toMatchObject({
      totalExpected: 23,
      totalMatched: 23,
      overallRecall: 1,
      falsePositives: 2,
      falsePositiveRate: 0.0222,
      costUsd: 0,
      llmCalled: false,
      telemetrySent: false
    });
    expect(report.summary.falsePositiveRate).toBeLessThan(0.1);
    expect(report.summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(
      report.summary.durationMs,
      `benchmark runtime exceeded ${BENCHMARK_RUNTIME_BUDGET_MS}ms budget`
    ).toBeLessThan(BENCHMARK_RUNTIME_BUDGET_MS);
    expect(report.metrics.byArea).toEqual([
      expect.objectContaining({ area: "security", expected: 13, matched: 13, recall: 1, falsePositives: 0 }),
      expect.objectContaining({ area: "regression", expected: 5, matched: 5, recall: 1, falsePositives: 2 }),
      expect.objectContaining({ area: "quality", expected: 5, matched: 5, recall: 1, falsePositives: 0 })
    ]);
    expect(report.metrics.byRuleId).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "security-sql-injection", expected: 3, matched: 3 }),
        expect.objectContaining({ ruleId: "security-missing-auth-entrypoint", expected: 3, matched: 3 }),
        expect.objectContaining({ ruleId: "security-path-traversal", expected: 2, matched: 2 }),
        expect.objectContaining({ ruleId: "happy-path-only-test", expected: 1, matched: 1 }),
        expect.objectContaining({ ruleId: "missing-nearby-tests", expected: 1, matched: 1 })
      ])
    );
    expect(report.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "one-hop-sqli",
          matchedRuleIds: ["security-sql-injection"]
        }),
        expect.objectContaining({
          id: "indirect-dynamic-sqli",
          matchedRuleIds: ["security-sql-injection"]
        }),
        expect.objectContaining({
          id: "plain-exported-destructive-missing-auth",
          matchedRuleIds: ["security-missing-auth-entrypoint"]
        }),
        expect.objectContaining({
          id: "auth-comment-destructive-missing-auth",
          matchedRuleIds: ["security-missing-auth-entrypoint"]
        }),
        expect.objectContaining({
          id: "one-hop-path-join-traversal",
          matchedRuleIds: ["security-path-traversal"]
        }),
        expect.objectContaining({
          id: "request-name-collision-decoy",
          falsePositiveRuleIds: []
        }),
        expect.objectContaining({
          id: "guarded-destructive-auth-decoy",
          falsePositiveRuleIds: []
        }),
        expect.objectContaining({
          id: "dynamic-sql-local-decoy",
          falsePositiveRuleIds: []
        })
      ])
    );
  }, BENCHMARK_CONTRACT_TIMEOUT_MS);

  it("renders markdown and writes output files", async () => {
    const cwd = createTempDir();
    const output = "reports/benchmark.md";
    const result = await run(["benchmark", "--format", "markdown", "--output", output], cwd);
    const rendered = readFileSync(join(cwd, output), "utf8");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(rendered).toContain("## CodeDecay Benchmark");
    expect(rendered).toContain("| Overall recall | 100% |");
    expect(rendered).toContain("| False-positive rate | 2.22% |");
    expect(rendered).toContain("- LLM/model called: no");
    expect(rendered).toContain("- Telemetry sent: no");
  }, BENCHMARK_CONTRACT_TIMEOUT_MS);

  it("cleans temporary corpus repositories when report generation fails", async () => {
    const cleanup = vi.fn();

    await expect(
      runBenchmark(
        { corpus: "default", format: "json" },
        {
          createRedteamReport: async () => {
            throw new Error("intentional benchmark failure");
          },
          loadCorpus: () => ({
            id: "failure-cleanup",
            rules: [],
            scenarios: [
              {
                id: "failure",
                kind: "positive",
                expectedRuleIds: [],
                setup: () => process.cwd()
              }
            ],
            cleanup
          })
        }
      )
    ).rejects.toThrow("intentional benchmark failure");

    expect(cleanup).toHaveBeenCalledOnce();
  });
});

async function run(args: string[], cwd = process.cwd()): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });

  return { exitCode, stdout, stderr };
}

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-benchmark-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}
