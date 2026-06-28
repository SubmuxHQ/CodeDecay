import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import type { CodeDecayLlmConfig } from "../types";
import { isPlainObject, normalizePositiveInteger } from "./primitives";

export function normalizeLlm(value: unknown, sourcePath: string): CodeDecayLlmConfig {
  if (value === undefined) {
    return { ...DEFAULT_CODEDECAY_CONFIG.llm };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm must be an object.`);
  }

  const provider = value.provider === undefined ? DEFAULT_CODEDECAY_CONFIG.llm.provider : value.provider;
  if (provider !== "disabled" && provider !== "ollama" && provider !== "litellm") {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.provider must be disabled, ollama, or litellm.`);
  }

  const llmConfig: CodeDecayLlmConfig = {
    provider,
    timeoutMs:
      value.timeoutMs === undefined
        ? DEFAULT_CODEDECAY_CONFIG.llm.timeoutMs
        : normalizePositiveInteger(value.timeoutMs, "llm.timeoutMs", sourcePath)
  };

  if (value.model !== undefined) {
    if (typeof value.model !== "string" || value.model.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.model must be a non-empty string.`);
    }
    llmConfig.model = value.model;
  }

  if (value.endpoint !== undefined) {
    if (typeof value.endpoint !== "string" || value.endpoint.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.endpoint must be a non-empty string.`);
    }
    llmConfig.endpoint = value.endpoint;
  }

  if (value.apiKeyEnv !== undefined) {
    if (typeof value.apiKeyEnv !== "string" || value.apiKeyEnv.trim().length === 0) {
      throw new Error(`Invalid CodeDecay config at ${sourcePath}: llm.apiKeyEnv must be a non-empty string.`);
    }
    llmConfig.apiKeyEnv = value.apiKeyEnv;
  }

  return llmConfig;
}
