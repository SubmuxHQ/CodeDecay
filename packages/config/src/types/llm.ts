export interface CodeDecayLlmConfig {
  provider: "disabled" | "ollama" | "litellm";
  model?: string | undefined;
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  timeoutMs: number;
}
