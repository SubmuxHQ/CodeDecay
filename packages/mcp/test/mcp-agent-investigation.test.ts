import { describe, expect, it } from "vitest";
import { runAgentInvestigationTool } from "../src/index";
import { createMissingTestRepo, writeFile } from "./helpers/mcp";

describe("MCP user-owned agent investigation", () => {
  it("requires explicit intent and returns grounded untrusted suggestions", async () => {
    const repo = createMissingTestRepo();
    writeFile(repo, ".codedecay/config.yml", [
      "version: 1",
      "llm:",
      "  provider: litellm",
      "  model: fake-agent",
      "  endpoint: http://127.0.0.1:4000/v1",
      ""
    ].join("\n"));
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ suggestions: [{
            title: "Missing API proof",
            detail: "Call the real users API.",
            edgeCases: ["empty result"],
            proposedProof: ["Assert the real response."]
          }] }) } }] };
        },
        async text() { return ""; }
      };
    }) as unknown as typeof fetch;

    try {
      const disabled = JSON.parse(await runAgentInvestigationTool(
        { cwd: repo },
        { format: "json", confirmInvestigation: false }
      ));
      expect(disabled.status).toBe("disabled");
      expect(calls).toBe(0);

      const result = JSON.parse(await runAgentInvestigationTool(
        { cwd: repo },
        { format: "json", confirmInvestigation: true }
      ));
      expect(result).toMatchObject({
        status: "completed",
        untrusted: true,
        llmCalled: true,
        suggestions: [{ title: "Missing API proof", edgeCases: ["empty result"] }]
      });
      expect(result.deterministicRiskChanged).toBe(false);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
