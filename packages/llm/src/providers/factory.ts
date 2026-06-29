import type { CodeDecayLlmConfig } from "@submuxhq/codedecay-config";
import type { LlmProvider } from "../types";
import { createDisabledLlmProvider } from "./disabled";
import { createLiteLlmProvider } from "./litellm";
import { createOllamaProvider } from "./ollama";

export function createLlmProvider(config: CodeDecayLlmConfig): LlmProvider {
  if (config.provider === "ollama") {
    if (!config.model) {
      throw new Error("Ollama LLM provider requires llm.model.");
    }

    return createOllamaProvider({
      model: config.model,
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs
    });
  }

  if (config.provider === "litellm") {
    if (!config.model) {
      throw new Error("LiteLLM provider requires llm.model.");
    }

    if (!config.endpoint) {
      throw new Error("LiteLLM provider requires llm.endpoint. CodeDecay does not default to a hosted LLM endpoint.");
    }

    return createLiteLlmProvider({
      model: config.model,
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs,
      apiKeyEnv: config.apiKeyEnv
    });
  }

  return createDisabledLlmProvider();
}
