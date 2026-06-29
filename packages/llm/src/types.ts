import type { RiskLevel } from "@submuxhq/codedecay-core";

export interface LlmPrompt {
  task: string;
  instructions?: string | undefined;
  context?: unknown;
}

export interface LlmSuggestion {
  title: string;
  detail: string;
  severity?: RiskLevel | undefined;
  evidence?: string[] | undefined;
}

export interface LlmCompletion {
  providerId: string;
  model?: string | undefined;
  text: string;
  suggestions: LlmSuggestion[];
  untrusted: true;
}

export interface LlmProvider {
  id: string;
  name: string;
  complete(prompt: LlmPrompt): Promise<LlmCompletion>;
}

export interface OllamaProviderOptions {
  model: string;
  endpoint?: string | undefined;
  timeoutMs?: number | undefined;
  fetch?: FetchLike | undefined;
}

export interface LiteLlmProviderOptions {
  model: string;
  endpoint: string;
  timeoutMs?: number | undefined;
  apiKey?: string | undefined;
  apiKeyEnv?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  fetch?: FetchLike | undefined;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal | undefined;
  }
) => Promise<FetchResponseLike>;
