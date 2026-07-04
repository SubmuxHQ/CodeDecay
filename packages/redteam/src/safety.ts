import type { RedteamSafetySummary } from "./types";

export function createRedteamSafetySummary(options: {
  commandsExecuted?: boolean | undefined;
  llmCalled?: boolean | undefined;
  memoryProvidersCalled?: boolean | undefined;
} = {}): RedteamSafetySummary {
  const commandsExecuted = options.commandsExecuted ?? false;
  const llmCalled = options.llmCalled ?? false;
  const memoryProvidersCalled = options.memoryProvidersCalled ?? false;
  return {
    commandsExecuted,
    llmCalled,
    telemetrySent: false,
    cloudDependency: false,
    notes: [
      commandsExecuted
        ? "Configured local checks were executed because this workflow explicitly opted into them."
        : "codedecay redteam is report-only unless --with-checks is explicitly requested.",
      providerSafetyNote({ llmCalled, memoryProvidersCalled }),
      commandsExecuted
        ? "Only commands configured in CodeDecay config were eligible to run."
        : "Use codedecay redteam --with-checks, codedecay execute, or codedecay differential explicitly when you want configured local checks to run."
    ]
  };
}

function providerSafetyNote(input: { llmCalled: boolean; memoryProvidersCalled: boolean }): string {
  if (input.llmCalled && input.memoryProvidersCalled) {
    return "User-configured LLM and external memory providers were called only because this workflow explicitly opted into them.";
  }

  if (input.llmCalled) {
    return "A user-configured LLM provider was called because investigation was explicitly requested.";
  }

  if (input.memoryProvidersCalled) {
    return "Explicitly configured external memory providers were loaded as untrusted context.";
  }

  return "No configured commands, probes, tool adapters, LLM providers, hosted services, or external memory providers are executed.";
}
