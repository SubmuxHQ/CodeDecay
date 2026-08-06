import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/resilience");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("codedecay resilience CLI", () => {
  it("evaluates a timeout-retry fixture", async () => {
    const root = createRepo();
    mkdirSync(join(root, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "timeout-retries.json"), join(root, "experiments", "timeout.json"));
    const result = await run([
      "resilience",
      "--cwd",
      root,
      "--experiment",
      "experiments/timeout.json",
      "--format",
      "json",
      "--output",
      "reports/resilience.json"
    ]);
    const report = JSON.parse(readFileSync(join(root, "reports", "resilience.json"), "utf8")) as {
      verdict: string;
      fullyVerified: boolean;
    };
    expect(result.exitCode).toBe(0);
    expect(report.verdict).toBe("confirmed-defect");
    expect(report.fullyVerified).toBe(false);
  });

  it("exposes resilience help", async () => {
    const result = await run(["resilience", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CodeDecay resilience");
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
  const root = join(tmpdir(), `codedecay-resilience-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  roots.push(root);
  return root;
}
