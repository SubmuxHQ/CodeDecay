import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/state-space");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("codedecay state-space CLI", () => {
  it("evaluates a stale-cache fixture in a child repository", async () => {
    const root = createRepo();
    mkdirSync(join(root, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "stale-cache.json"), join(root, "experiments", "stale-cache.json"));
    const result = await run([
      "state-space",
      "--cwd",
      root,
      "--experiment",
      "experiments/stale-cache.json",
      "--format",
      "json",
      "--output",
      "reports/state-space.json"
    ]);
    const report = JSON.parse(readFileSync(join(root, "reports", "state-space.json"), "utf8")) as {
      verdict: string;
      fullyVerified: boolean;
      coverage: { exhaustive: boolean };
    };
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(report.verdict).toBe("confirmed-regression");
    expect(report.fullyVerified).toBe(false);
    expect(report.coverage.exhaustive).toBe(false);
  });

  it("exposes state-space help", async () => {
    const result = await run(["state-space", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CodeDecay state-space");
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
  const root = join(tmpdir(), `codedecay-state-space-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  roots.push(root);
  return root;
}
