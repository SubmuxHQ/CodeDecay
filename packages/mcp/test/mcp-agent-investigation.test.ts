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
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const evidenceId = firstHypothesisEvidenceId(String(init?.body ?? "")) ?? "missing:evidence";
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({
            suggestions: [{
              title: "Missing API proof",
              detail: "Call the real users API.",
              edgeCases: ["empty result"],
              proposedProof: ["Assert the real response."]
            }],
            hypotheses: [{
              id: "HYPOTHESIS-1",
              claim: "Users API can regress because no API-level proof ran.",
              affectedRequirementOrFlow: "Users API",
              causalChain: ["users route changed", "test evidence is missing"],
              evidenceIds: [evidenceId],
              assumptions: ["The missing proof maps to the real API route."],
              uncertainty: "Need a real API-level check.",
              userVisibleConsequence: "Users may receive a broken or unauthorized response.",
              severitySuggestion: "medium",
              disconfirmingResult: "A configured API check passes against the real route.",
              proposedVerifier: { kind: "configured-check", name: "users API test" },
              status: "candidate"
            }]
          }) } }] };
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
        suggestions: [{ title: "Missing API proof", edgeCases: ["empty result"] }],
        hypotheses: {
          schemaVersion: 1,
          hypotheses: [{ id: "HYPOTHESIS-1", proposedVerifier: { kind: "configured-check" } }]
        }
      });
      expect(result.deterministicRiskChanged).toBe(false);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function firstHypothesisEvidenceId(body: string): string | undefined {
  const request = JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
  const prompt = request.messages.find((message) => message.role === "user")?.content ?? "";
  const match = /"hypothesisEvidenceIds":\s*\[\s*"([^"]+)"/.exec(prompt);
  return match?.[1];
}
