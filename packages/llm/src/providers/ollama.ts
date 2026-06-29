import { DEFAULT_LLM_TIMEOUT_MS, DEFAULT_OLLAMA_ENDPOINT } from "../constants";
import { normalizeEndpoint } from "../endpoint";
import { parseOllamaText, parseSuggestions } from "../parsing";
import { formatPrompt } from "../prompt";
import type { LlmCompletion, LlmPrompt, LlmProvider, OllamaProviderOptions } from "../types";

export function createOllamaProvider(options: OllamaProviderOptions): LlmProvider {
  const endpoint = normalizeEndpoint(options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT);
  const timeoutMs = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("Ollama LLM provider requires fetch support in this runtime.");
  }

  if (!options.model.trim()) {
    throw new Error("Ollama LLM provider requires a model.");
  }

  return {
    id: "ollama",
    name: "Ollama",
    async complete(prompt: LlmPrompt): Promise<LlmCompletion> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${endpoint}/api/generate`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: options.model,
            prompt: formatPrompt(prompt),
            stream: false
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Ollama request failed with ${response.status}: ${body}`);
        }

        const payload = await response.json();
        const text = parseOllamaText(payload);

        return {
          providerId: "ollama",
          model: options.model,
          text,
          suggestions: parseSuggestions(text),
          untrusted: true
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
