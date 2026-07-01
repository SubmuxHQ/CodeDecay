import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./helpers";

const tempRoots: string[] = [];
const describeLoopE2e = process.env.CODEDECAY_LOOP_E2E === "1" ? describe : describe.skip;

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describeLoopE2e("codedecay loop real edit convergence", () => {
  it("drives a deterministic agent script from weak test to merge-safe-*", async () => {
    const repo = createLoopConvergenceRepo();

    const result = await run([
      "loop",
      "--format",
      "json",
      "--max-rounds",
      "3",
      "--agent-cmd",
      "node scripts/fix-test.mjs"
    ], repo);
    const report = JSON.parse(result.stdout) as {
      status: string;
      rounds: Array<{ mergeRiskScore: number; weakTestFindings: number; agent?: { madeChanges: boolean } }>;
      safety: { llmCalled: boolean; telemetrySent: boolean; autoCommitted: boolean; autoPushed: boolean };
    };

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(report.status.startsWith("merge-safe-")).toBe(true);
    expect(report.rounds.length).toBeGreaterThanOrEqual(2);
    expect(report.rounds[0]?.weakTestFindings).toBeGreaterThan(report.rounds.at(-1)?.weakTestFindings ?? 0);
    expect(report.rounds[0]?.mergeRiskScore).toBeGreaterThan(report.rounds.at(-1)?.mergeRiskScore ?? 0);
    expect(report.rounds[0]?.agent?.madeChanges).toBe(true);
    expect(readFileSync(join(repo, "test/checkout.test.js"), "utf8")).toContain("rejects negative totals");
    expect(existsSync(join(repo, ".git"))).toBe(true);
    expect(report.safety).toMatchObject({
      llmCalled: false,
      telemetrySent: false,
      autoCommitted: false,
      autoPushed: false
    });
  });
});

function createLoopConvergenceRepo(): string {
  const repo = join(tmpdir(), `codedecay-loop-e2e-${Math.random().toString(16).slice(2)}`);
  mkdirSync(repo, { recursive: true });
  tempRoots.push(repo);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Test"]);
  writeFile(repo, "package.json", JSON.stringify({ type: "module" }, null, 2));
  writeFile(repo, "src/checkout.js", "export function calculateTotal(amount, tax) { return amount + tax; }\n");
  writeFile(
    repo,
    "test/checkout.test.js",
    [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert/strict';",
      "import { calculateTotal } from '../src/checkout.js';",
      "",
      "test('calculates total', () => {",
      "  strictEqual(calculateTotal(100, 8), 108);",
      "});",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "commands:",
      "  test:",
      "    - node --test test/checkout.test.js",
      "safety:",
      "  commandTimeoutMs: 1000",
      "  allowCommands: true",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "scripts/fix-test.mjs",
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('test/checkout.test.js', [",
      "  \"import { test } from 'node:test';\",",
      "  \"import { strictEqual, throws } from 'node:assert/strict';\",",
      "  \"import { calculateTotal } from '../src/checkout.js';\",",
      "  \"\",",
      "  \"test('calculates total with tax', () => {\",",
      "  \"  strictEqual(calculateTotal(100, 8), 108);\",",
      "  \"});\",",
      "  \"\",",
      "  \"test('rejects negative totals', () => {\",",
      "  \"  throws(() => calculateTotal(-1, 0), /amount/);\",",
      "  \"});\",",
      "  \"\"",
      "].join('\\n'));",
      ""
    ].join("\n")
  );
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);

  writeFile(
    repo,
    "src/checkout.js",
    [
      "export function calculateTotal(amount, tax) {",
      "  if (amount < 0) throw new Error('amount must be positive');",
      "  return amount + tax;",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "test/checkout.test.js",
    [
      "import { test } from 'node:test';",
      "import { calculateTotal } from '../src/checkout.js';",
      "",
      "test('calculates total', () => {",
      "  calculateTotal(100, 8);",
      "});",
      ""
    ].join("\n")
  );

  return repo;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}
