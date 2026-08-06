import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runResilienceSafetyTool } from "../src/index";
import { createRepo } from "./helpers/mcp";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/resilience");

describe("MCP resilience_safety tool", () => {
  it("blocks production-like targets", async () => {
    const repo = createRepo({ "README.md": "# fixture\n" });
    mkdirSync(join(repo, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "prod-target.json"), join(repo, "experiments", "prod.json"));
    const output = await runResilienceSafetyTool(
      { cwd: repo },
      { format: "json", experimentFile: "experiments/prod.json" }
    );
    const report = JSON.parse(output) as { verdict: string; safety: { chaosInjected: boolean } };
    expect(report.verdict).toBe("target-blocked");
    expect(report.safety.chaosInjected).toBe(false);
  });
});
