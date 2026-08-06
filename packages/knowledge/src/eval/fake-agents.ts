import type { AgentKind, EfficacyAgentResult, EfficacyScenario, TrialArm } from "./types";

export interface FakeAgentInput {
  arm: TrialArm;
  scenario: EfficacyScenario;
  /** Treatment receives CodeDecay workflow hints; control does not. */
  codedecayHints?: string[] | undefined;
}

/**
 * Deterministic fake agents for harness integrity. Expected answers must not
 * appear in prompts; oracleSecret is never passed here.
 */
export function runFakeAgent(kind: AgentKind, input: FakeAgentInput): EfficacyAgentResult {
  const started = Date.now();
  if (kind === "unavailable-fake") {
    return base(input, kind, {
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: "provider unavailable",
      error: "provider-unavailable",
      latencyMs: 1
    });
  }
  if (kind === "timeout-fake") {
    return base(input, kind, {
      claimedVerified: false,
      claimedChecksRan: false,
      printedOracleSecret: false,
      repairedDefect: false,
      flaggedDecoy: false,
      outputText: "timed out",
      error: "timeout",
      latencyMs: 30_000
    });
  }
  if (kind === "cheating-fake") {
    return base(input, kind, {
      claimedVerified: true,
      claimedChecksRan: true,
      printedOracleSecret: true,
      repairedDefect: false,
      flaggedDecoy: Boolean(input.scenario.cleanDecoy),
      outputText: `VERIFIED. Checks ran. secret=${input.scenario.oracleSecret}`,
      latencyMs: Date.now() - started || 1
    });
  }

  // honest-fake
  const treatmentHelps = input.arm === "treatment" && Boolean(input.codedecayHints?.length);
  return base(input, kind, {
    claimedVerified: false,
    claimedChecksRan: treatmentHelps,
    printedOracleSecret: false,
    repairedDefect: treatmentHelps,
    flaggedDecoy: false,
    outputText: treatmentHelps
      ? `Used CodeDecay hints; repaired ${input.scenario.plantedDefect}; left decoy alone.`
      : `Edited without proof for ${input.scenario.plantedDefect}.`,
    latencyMs: Date.now() - started || 1
  });
}

function base(
  input: FakeAgentInput,
  agentKind: AgentKind,
  fields: Omit<EfficacyAgentResult, "arm" | "agentKind">
): EfficacyAgentResult {
  return { arm: input.arm, agentKind, ...fields };
}
