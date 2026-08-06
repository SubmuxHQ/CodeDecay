import { describe, expect, it } from "vitest";
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPolicyDecisionTool } from "../src/index";
import { createRepo } from "./helpers/mcp";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge/test/fixtures/policy");

describe("MCP policy_decision tool", () => {
  it("returns the same decisionId as repeated calls for conflict fixtures", async () => {
    const repo = createRepo({ "README.md": "# fixture\n" });
    cpSync(join(fixtures, "conflict"), join(repo, ".codedecay"), { recursive: true });
    const input = {
      format: "json" as const,
      policyDirs: [".codedecay/policies"],
      orgPolicyDirs: [".codedecay/org-policies"],
      changedPaths: ["src/auth/session.ts"],
      now: "2026-08-06T12:00:00.000Z"
    };
    const a = JSON.parse(await runPolicyDecisionTool({ cwd: repo }, input)) as { decisionId: string; verdict: string };
    const b = JSON.parse(await runPolicyDecisionTool({ cwd: repo }, input)) as { decisionId: string; verdict: string };
    expect(a.verdict).toBe("conflict");
    expect(a.decisionId).toBe(b.decisionId);
  });
});
