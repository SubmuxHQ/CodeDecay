import { describe, expect, it } from "vitest";
import { createLlmProvider } from "../src/index";

describe("LLM provider factory", () => {
  it("creates an Ollama provider from config", () => {
    const provider = createLlmProvider({
      provider: "ollama",
      model: "qwen2.5-coder",
      endpoint: "http://127.0.0.1:11434/",
      timeoutMs: 10_000
    });

    expect(provider.id).toBe("ollama");
  });

  it("creates a LiteLLM provider from explicit BYOK config", () => {
    const provider = createLlmProvider({
      provider: "litellm",
      model: "gpt-4.1-mini",
      endpoint: "http://127.0.0.1:4000/v1",
      apiKeyEnv: "LITELLM_API_KEY",
      timeoutMs: 10_000
    });

    expect(provider.id).toBe("litellm");
  });

  it("requires an explicit LiteLLM endpoint instead of defaulting to a hosted model", () => {
    expect(() =>
      createLlmProvider({
        provider: "litellm",
        model: "gpt-4.1-mini",
        timeoutMs: 10_000
      })
    ).toThrow("LiteLLM provider requires llm.endpoint. CodeDecay does not default to a hosted LLM endpoint.");
  });
});
