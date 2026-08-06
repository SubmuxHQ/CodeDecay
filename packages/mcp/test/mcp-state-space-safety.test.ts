import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runStateSpaceSafetyTool } from "../src/index";
import { createRepo } from "./helpers/mcp";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/state-space");

describe("MCP state_space_safety tool", () => {
  it("blocks unconfigured remote flag provider contact", async () => {
    const repo = createRepo({ "README.md": "# fixture\n" });
    mkdirSync(join(repo, "experiments"), { recursive: true });
    copyFileSync(join(fixtures, "remote-provider.json"), join(repo, "experiments", "remote.json"));
    const output = await runStateSpaceSafetyTool(
      { cwd: repo },
      { format: "json", experimentFile: "experiments/remote.json" }
    );
    const report = JSON.parse(output) as {
      verdict: string;
      safety: { commandsExecuted: boolean; remoteFlagProviderContacted: boolean };
    };
    expect(report.verdict).toBe("provider-blocked");
    expect(report.safety.commandsExecuted).toBe(false);
    expect(report.safety.remoteFlagProviderContacted).toBe(true);
  });
});
