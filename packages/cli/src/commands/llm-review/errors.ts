export function formatLlmReviewError(
  error: unknown,
  provider: "disabled" | "ollama" | "litellm"
): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("llm.model") || message.includes("llm.endpoint")) {
    return new Error(`${message} Run "codedecay config --format markdown" to verify your llm settings.`);
  }

  if (message.includes("could not read API key from environment variable")) {
    return new Error(`${message} Export the configured variable, then rerun "codedecay llm-review --ping".`);
  }

  if (provider === "ollama" && /fetch support|ECONNREFUSED|request failed|abort/i.test(message)) {
    return new Error(`${message} Ensure Ollama is running at the configured endpoint and the model is available before rerunning "codedecay llm-review --ping".`);
  }

  if (provider === "litellm" && /request failed|401|403|404|message content|choices/i.test(message)) {
    return new Error(`${message} Verify the LiteLLM/OpenAI-compatible endpoint, model name, and API key configuration, then rerun "codedecay llm-review --ping".`);
  }

  return new Error(message);
}
