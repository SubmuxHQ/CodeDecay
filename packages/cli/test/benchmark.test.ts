import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BenchmarkReport } from "../src/benchmark/run";
import { runCli } from "../src/index";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const tempRoots: string[] = [];

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
      totalExpected: 18,
      totalMatched: 18,
      overallRecall: 1,
      falsePositives: 2,
      falsePositiveRate: 0.0556,
      costUsd: 0,
      llmCalled: false,
      telemetrySent: false
    });
    expect(report.summary.falsePositiveRate).toBeLessThan(0.1);
    expect(report.summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.metrics.byArea).toEqual([
      expect.objectContaining({ area: "security", expected: 8, matched: 8, recall: 1, falsePositives: 0 }),
      expect.objectContaining({ area: "regression", expected: 5, matched: 5, recall: 1, falsePositives: 2 }),
      expect.objectContaining({ area: "quality", expected: 5, matched: 5, recall: 1, falsePositives: 0 })
    ]);
    expect(report.metrics.byRuleId).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "security-sql-injection", expected: 1, matched: 1 }),
        expect.objectContaining({ ruleId: "happy-path-only-test", expected: 1, matched: 1 }),
        expect.objectContaining({ ruleId: "missing-nearby-tests", expected: 1, matched: 1 })
      ])
    );
  });

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
    expect(rendered).toContain("| False-positive rate | 5.56% |");
    expect(rendered).toContain("- LLM/model called: no");
    expect(rendered).toContain("- Telemetry sent: no");
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
