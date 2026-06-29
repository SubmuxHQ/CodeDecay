import type { RiskLevel, TestEvidenceMode } from "@submuxhq/codedecay-core";
import type { LlmSuggestion } from "@submuxhq/codedecay-llm";
import type { ConfigFormat } from "./common";

export interface LlmReviewOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  task?: string | undefined;
  ping: boolean;
}

export interface LlmReviewReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  mode: "ping" | "review";
  configSource?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
  provider: {
    id: string;
    configuredProvider: "disabled" | "ollama" | "litellm";
    model?: string | undefined;
    endpoint?: string | undefined;
    apiKeyEnv?: string | undefined;
    timeoutMs: number;
  };
  summary?: {
    mergeRiskScore: number;
    decayScore: number;
    riskLevel: RiskLevel;
    changedFiles: number;
    impactedAreas: number;
    impactedRoutes: number;
    evidenceMode: TestEvidenceMode;
  };
  suggestions: LlmSuggestion[];
  rawText: string;
  untrusted: true;
}
