import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, run, writeFile } from "./helpers";

describe("codedecay llm-review CLI contract", () => {
  it("fails clearly when llm review is not configured", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["llm-review", "--ping"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('CodeDecay failed: LLM review requires llm.provider to be set to "ollama" or "litellm".');
    expect(result.stderr).toContain('codedecay config --format markdown');
  });

  it("fails clearly when a configured LiteLLM API key env var is missing", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: MISSING_LITELLM_API_KEY",
        ""
      ].join("\n")
    );

    const result = await run(["llm-review", "--ping"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("LiteLLM provider could not read API key from environment variable MISSING_LITELLM_API_KEY.");
    expect(result.stderr).toContain('codedecay llm-review --ping');
  });

  it("renders structured suggestions from a configured LiteLLM provider", async () => {
    const repo = createLowRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: LITELLM_API_KEY",
        ""
      ].join("\n")
    );

    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.LITELLM_API_KEY;
    process.env.LITELLM_API_KEY = "test-key";
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: [
                    {
                      title: "Auth negative path",
                      detail: "Exercise the missing token route through the real API boundary.",
                      severity: "high",
                      evidence: ["merge risk 39/100", "docs-oriented change still touches repo safety flow"]
                    }
                  ]
                })
              }
            }
          ]
        };
      },
      async text() {
        return "";
      }
    })) as unknown as typeof fetch;

    try {
      const result = await run(["llm-review", "--format", "markdown"], repo);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("## CodeDecay LLM Review");
      expect(result.stdout).toContain("Structured suggestions | 1 |");
      expect(result.stdout).toContain("Auth negative path");
      expect(result.stdout).toContain("LLM suggestions are untrusted");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.LITELLM_API_KEY;
      } else {
        process.env.LITELLM_API_KEY = originalApiKey;
      }
    }
  });
});
