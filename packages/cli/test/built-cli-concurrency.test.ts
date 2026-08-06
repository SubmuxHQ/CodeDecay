import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createRepo, ensureBuiltCli, runBuilt } from "./helpers/built-cli";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/concurrency");

beforeAll(ensureBuiltCli, 120_000);

describe("built codedecay concurrency workflow", () => {
  it("evaluates a fixture oracle from the bundled CLI without spawning a scheduler", () => {
    const root = createRepo({ "README.md": "fixture\n" });
    mkdirSync(join(root, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "idempotent.json"), join(root, "experiments", "idempotent.json"));
    const result = runBuilt([
      "concurrency",
      "--cwd",
      root,
      "--experiment",
      "experiments/idempotent.json",
      "--format",
      "json"
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      verdict: string;
      fullyVerified: boolean;
      safety: Record<string, boolean>;
    };
    expect(report.verdict).toBe("passed-oracle");
    expect(report.fullyVerified).toBe(false);
    expect(report.safety).toMatchObject({
      commandsExecuted: false,
      networkCalled: false,
      schedulerSpawned: false
    });
  });

  it("exposes concurrency help from the bundled command registry", () => {
    createRepo({ "README.md": "fixture\n" });
    const result = runBuilt(["concurrency", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CodeDecay concurrency");
    expect(result.stdout).toContain("--experiment <path>");
  });
});
