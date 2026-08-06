import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/policy");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("codedecay policy CLI", () => {
  it("emits a deterministic payment-migration decision", async () => {
    const root = createRepo();
    cpSync(join(fixtures, "payment-migration"), join(root, ".codedecay"), { recursive: true });
    const result = await run([
      "policy",
      "--cwd",
      root,
      "--changed",
      "prisma/migrations/20260806_payout/migration.sql",
      "--change-class",
      "migration",
      "--now",
      "2026-08-06T12:00:00.000Z",
      "--format",
      "json",
      "--output",
      "reports/policy.json"
    ]);
    const report = JSON.parse(readFileSync(join(root, "reports", "policy.json"), "utf8")) as {
      verdict: string;
      decisionId: string;
      fullyVerified: boolean;
    };
    expect(result.exitCode).toBe(0);
    expect(report.verdict).toBe("require-proof");
    expect(report.fullyVerified).toBe(false);
    expect(report.decisionId.length).toBeGreaterThan(8);
  });

  it("exposes policy help", async () => {
    const result = await run(["policy", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CodeDecay policy");
  });
});

async function run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });
  return { exitCode, stdout, stderr };
}

function createRepo(): string {
  const root = join(tmpdir(), `codedecay-policy-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  roots.push(root);
  return root;
}
