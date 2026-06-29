import type { LlmSuggestion } from "./types";
import { isPlainObject } from "./object";

export function parseOllamaText(payload: unknown): string {
  if (isPlainObject(payload) && typeof payload.response === "string") {
    return payload.response;
  }

  throw new Error("Ollama response did not include a response string.");
}

export function parseOpenAiCompatibleText(payload: unknown): string {
  if (!isPlainObject(payload) || !Array.isArray(payload.choices)) {
    throw new Error("LiteLLM response did not include choices.");
  }

  const firstChoice = payload.choices[0];
  if (
    isPlainObject(firstChoice) &&
    isPlainObject(firstChoice.message) &&
    typeof firstChoice.message.content === "string"
  ) {
    return firstChoice.message.content;
  }

  throw new Error("LiteLLM response did not include message content.");
}

export function parseSuggestions(text: string): LlmSuggestion[] {
  const parsed = parseJsonFromText(text);
  if (!isPlainObject(parsed) || !Array.isArray(parsed.suggestions)) {
    return [];
  }

  return parsed.suggestions.flatMap((suggestion) => normalizeSuggestion(suggestion));
}

function normalizeSuggestion(value: unknown): LlmSuggestion[] {
  if (!isPlainObject(value) || typeof value.title !== "string" || typeof value.detail !== "string") {
    return [];
  }

  const suggestion: LlmSuggestion = {
    title: value.title,
    detail: value.detail
  };

  if (value.severity === "low" || value.severity === "medium" || value.severity === "high") {
    suggestion.severity = value.severity;
  }

  if (Array.isArray(value.evidence) && value.evidence.every((item) => typeof item === "string")) {
    suggestion.evidence = [...value.evidence];
  }

  return [suggestion];
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}
