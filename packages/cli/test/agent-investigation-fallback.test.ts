import { describe, expect, it } from "vitest";
import { createMediumRiskRepo, run, writeFile } from "./helpers";

describe("codedecay agent investigation fallback", () => {
  it("keeps the deterministic bundle when the configured provider is invalid", async () => {
    const repo = createMediumRiskRepo();
    writeFile(repo, ".codedecay/config.yml", [
      "version: 1",
      "llm:",
      "  provider: litellm",
      "  model: fake-agent",
      ""
    ].join("\n"));

    const result = await run(["agent", "--investigate", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.summary.changedFiles).toBeGreaterThan(0);
    expect(bundle.investigation).toMatchObject({
      status: "failed",
      suggestions: [],
      llmCalled: false,
      untrusted: true
    });
    expect(bundle.investigation.limitations[0]).toContain("LiteLLM provider requires llm.endpoint");
    expect(bundle.safety.llmCalled).toBe(false);
  });
});
