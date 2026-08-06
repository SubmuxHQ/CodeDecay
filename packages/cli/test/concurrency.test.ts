import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/concurrency");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("codedecay concurrency CLI", () => {
  it("evaluates a duplicate-delivery fixture in a child repository", async () => {
    const root = createRepo();
    mkdirSync(join(root, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "duplicate-delivery.json"), join(root, "experiments", "duplicate.json"));
    const result = await run([
      "concurrency",
      "--cwd",
      root,
      "--experiment",
      "experiments/duplicate.json",
      "--format",
      "json",
      "--output",
      "reports/concurrency.json"
    ]);
    const report = JSON.parse(readFileSync(join(root, "reports", "concurrency.json"), "utf8")) as {
      verdict: string;
      fullyVerified: boolean;
      safety: Record<string, boolean>;
    };
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(report.verdict).toBe("confirmed-race");
    expect(report.fullyVerified).toBe(false);
    expect(report.safety).toMatchObject({
      commandsExecuted: false,
      networkCalled: false,
      schedulerSpawned: false
    });
  });

  it("exposes concurrency help", async () => {
    const result = await run(["concurrency", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CodeDecay concurrency");
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
  const root = join(tmpdir(), `codedecay-concurrency-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  roots.push(root);
  return root;
}
