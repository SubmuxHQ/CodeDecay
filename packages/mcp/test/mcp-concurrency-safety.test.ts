import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConcurrencySafetyTool } from "../src/index";
import { createRepo } from "./helpers/mcp";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/concurrency");

describe("MCP concurrency_safety tool", () => {
  it("confirms duplicate delivery without executing commands", async () => {
    const repo = createRepo({
      "README.md": "# fixture\n"
    });
    mkdirSync(join(repo, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "duplicate-delivery.json"), join(repo, "experiments", "duplicate.json"));
    const output = await runConcurrencySafetyTool(
      { cwd: repo },
      {
        format: "json",
        experimentFile: "experiments/duplicate.json",
        cleanupPlan: "reset fixture"
      }
    );
    const report = JSON.parse(output) as {
      verdict: string;
      fullyVerified: boolean;
      safety: { commandsExecuted: boolean; networkCalled: boolean };
    };
    expect(report.verdict).toBe("confirmed-race");
    expect(report.fullyVerified).toBe(false);
    expect(report.safety.commandsExecuted).toBe(false);
    expect(report.safety.networkCalled).toBe(false);
  });

  it("blocks over-budget experiments", async () => {
    const repo = createRepo({
      "README.md": "# fixture\n"
    });
    mkdirSync(join(repo, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "bounds-blocked.json"), join(repo, "experiments", "bounds.json"));
    const output = await runConcurrencySafetyTool(
      { cwd: repo },
      { format: "json", experimentFile: "experiments/bounds.json" }
    );
    const report = JSON.parse(output) as { verdict: string; boundsBlocked: boolean };
    expect(report.verdict).toBe("bounds-blocked");
    expect(report.boundsBlocked).toBe(true);
  });
});
