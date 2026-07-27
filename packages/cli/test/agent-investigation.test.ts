import { describe, expect, it } from "vitest";
import type { RedteamVerificationSummary } from "@submuxhq/codedecay-redteam";
import { investigationVerificationContext } from "../src/commands/redteam-investigation";
import { createMediumRiskRepo, createRepo, run, writeFile } from "./helpers";

describe("codedecay agent investigation closed-loop UAT", () => {
  it("grounds post-diff suggestions without changing deterministic risk", async () => {
    const repo = createMediumRiskRepo();
    configureProvider(repo);
    writeFile(repo, "requirements.json", JSON.stringify({
      acceptanceCriteria: [{ id: "AC-1", text: "Users API remains authorized." }],
      affectedFlows: [{ name: "Users API", kind: "api" }]
    }));
    const baseline = JSON.parse((await run(["agent", "--format", "json"], repo)).stdout);
    let prompt = "";
    const restore = fakeProvider((body) => {
      const request = JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
      prompt = request.messages.find((message) => message.role === "user")?.content ?? "";
    });

    try {
      const result = await run([
        "agent", "--investigate", "--task", "Update users API",
        "--requirements", "requirements.json", "--format", "json"
      ], repo);
      const bundle = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(bundle.summary.mergeRiskScore).toBe(baseline.summary.mergeRiskScore);
      expect(bundle.investigation).toMatchObject({
        status: "completed",
        untrusted: true,
        suggestions: [{
          title: "Authorization regression",
          affectedFlows: ["Users API"],
          edgeCases: ["expired session"],
          proposedProof: ["Call the real route without a token."],
          unresolvedQuestions: ["Which roles may export?"]
        }]
      });
      expect(bundle.safety.llmCalled).toBe(true);
      expect(prompt).toContain("AC-1");
      expect(prompt).toContain("changedPathProof");
      expect(prompt).toContain("verification");
      expect(prompt).toContain('"status": "not-run"');
      expect(prompt).toContain("No configured checks were executed before this investigation.");
      expect(prompt).toContain("limitations");

      const markdown = await run([
        "agent", "--investigate", "--task", "Update users API",
        "--requirements", "requirements.json", "--format", "markdown"
      ], repo);
      expect(markdown.stdout).toContain("### Untrusted Agent Investigation");
      expect(markdown.stdout).toContain("Authorization regression");
      expect(markdown.stdout).toContain("Proposed proof: Call the real route without a token.");
    } finally {
      restore();
    }
  });

  it("uses an explicit not-run verification summary and preserves real evidence", () => {
    const notRun = investigationVerificationContext(undefined);
    expect(notRun.status).toBe("not-run");
    expect(notRun.commandsExecuted).toBe(false);
    expect(notRun.total).toBe(0);
    expect(notRun.checks).toEqual([]);
    expect(notRun.notes.join(" ")).toMatch(/no configured checks.*executed/i);
    expect(notRun.passed + notRun.failed + notRun.skipped + notRun.blocked + notRun.timedOut + notRun.errors).toBe(0);
    const verified: RedteamVerificationSummary = {
      ...notRun,
      status: "verified",
      commandsExecuted: true,
      total: 1,
      passed: 1,
      durationMs: 42,
      checks: [
        {
          kind: "test",
          name: "unit tests",
          command: "pnpm test",
          status: "passed",
          proof: "tool-evidence",
          summary: "Tests passed.",
          durationMs: 42
        }
      ],
      notes: ["All configured checks passed."]
    };

    expect(investigationVerificationContext(verified)).toBe(verified);
  });

  it("supports explicit pre-change investigation and never calls a provider by default", async () => {
    const repo = createRepo({ "src/billing/export.ts": "export const exportBilling = () => [];\n" });
    configureProvider(repo);
    let calls = 0;
    const restore = fakeProvider(() => { calls += 1; });

    try {
      const deterministic = await run([
        "agent", "preflight", "--task", "Add billing export API", "--format", "json"
      ], repo);
      expect(JSON.parse(deterministic.stdout).investigation).toBeUndefined();
      expect(calls).toBe(0);

      const investigated = await run([
        "agent", "preflight", "--investigate",
        "--task", "Add billing export API", "--format", "json"
      ], repo);
      const report = JSON.parse(investigated.stdout);
      expect(report.investigation).toMatchObject({ status: "completed", untrusted: true, llmCalled: true });
      expect(report.safety.llmCalled).toBe(true);
      expect(calls).toBe(1);

      const markdown = await run([
        "agent", "preflight", "--investigate",
        "--task", "Add billing export API", "--format", "markdown"
      ], repo);
      expect(markdown.stdout).toContain("### Untrusted Agent Investigation");
      expect(markdown.stdout).toContain("Authorization regression");
      expect(calls).toBe(2);
    } finally {
      restore();
    }
  });
});

function configureProvider(repo: string): void {
  writeFile(repo, ".codedecay/config.yml", [
    "version: 1",
    "llm:",
    "  provider: litellm",
    "  model: fake-agent",
    "  endpoint: http://127.0.0.1:4000/v1",
    ""
  ].join("\n"));
}

function fakeProvider(onRequest: (body: string) => void): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    onRequest(String(init?.body ?? ""));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content: JSON.stringify({ suggestions: [{
            title: "Authorization regression",
            detail: "The changed API may bypass the existing role check.",
            severity: "high",
            evidence: ["changed users API"],
            affectedFlows: ["Users API"],
            edgeCases: ["expired session"],
            proposedProof: ["Call the real route without a token."],
            unresolvedQuestions: ["Which roles may export?"]
          }] }) } }]
        };
      },
      async text() { return ""; }
    };
  }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}
