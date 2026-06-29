import type { RedteamSafetySummary } from "./types";

export function createRedteamSafetySummary(options: { llmCalled?: boolean | undefined } = {}): RedteamSafetySummary {
  const llmCalled = options.llmCalled ?? false;
  return {
    commandsExecuted: false,
    llmCalled,
    telemetrySent: false,
    cloudDependency: false,
    notes: [
      "codedecay redteam is report-only in this MVP.",
      llmCalled
        ? "A user-configured LLM provider was called because investigation was explicitly requested."
        : "No configured commands, probes, tool adapters, LLM providers, hosted services, or memory providers are executed.",
      "Use codedecay execute or codedecay differential explicitly when you want configured local checks to run."
    ]
  };
}
