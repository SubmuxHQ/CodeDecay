import type { RedteamSafetySummary } from "./types";

export function createRedteamSafetySummary(): RedteamSafetySummary {
  return {
    commandsExecuted: false,
    llmCalled: false,
    telemetrySent: false,
    cloudDependency: false,
    notes: [
      "codedecay redteam is report-only in this MVP.",
      "No configured commands, probes, tool adapters, LLM providers, hosted services, or memory providers are executed.",
      "Use codedecay execute or codedecay differential explicitly when you want configured local checks to run."
    ]
  };
}
