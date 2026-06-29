import type { LlmCompletion, LlmProvider } from "../types";

export function createDisabledLlmProvider(): LlmProvider {
  return {
    id: "disabled",
    name: "Disabled LLM provider",
    async complete(): Promise<LlmCompletion> {
      return {
        providerId: "disabled",
        text: "",
        suggestions: [],
        untrusted: true
      };
    }
  };
}
