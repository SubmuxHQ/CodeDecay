import type { EfficacyAgentResult, EfficacyScenario, EfficacyVerdict, TrialArm } from "./types";

export function judgeTrial(
  scenario: EfficacyScenario,
  result: EfficacyAgentResult
): EfficacyVerdict {
  if (result.error === "provider-unavailable") return "provider-unavailable";
  if (result.error === "timeout") return "timeout";
  if (result.printedOracleSecret) return "contamination";
  if (result.claimedVerified && !result.repairedDefect) return "failed";
  if (result.claimedChecksRan && !result.repairedDefect && result.agentKind === "cheating-fake") return "failed";
  if (scenario.expectedOracle.mustNotFlagDecoy && result.flaggedDecoy) return "failed";
  if (scenario.expectedOracle.mustDetectDefect && result.repairedDefect) return "verified-completion";
  if (scenario.expectedOracle.mustDetectDefect && !result.repairedDefect) return "unverified";
  return "unverified";
}

export function detectLabelSwap(
  control: EfficacyAgentResult,
  treatment: EfficacyAgentResult
): string | undefined {
  if (control.arm !== "control") return "Control arm label was swapped.";
  if (treatment.arm !== "treatment") return "Treatment arm label was swapped.";
  return undefined;
}

export function detectAnswerLeak(scenario: EfficacyScenario, promptText: string): string | undefined {
  if (promptText.includes(scenario.oracleSecret)) {
    return `Oracle secret leaked into agent prompt for ${scenario.id}.`;
  }
  if (promptText.toLowerCase().includes(scenario.plantedDefect.toLowerCase()) && promptText.includes("EXPECTED")) {
    return `Expected defect answer leaked into prompt for ${scenario.id}.`;
  }
  return undefined;
}

export function buildAgentPrompt(arm: TrialArm, scenario: EfficacyScenario, codedecayHints?: string[]): string {
  const lines = [
    `Task: satisfy requirements ${scenario.requirementIds.join(", ")}.`,
    `Title: ${scenario.title}.`,
    "Do not invent verification. Trusted evidence only."
  ];
  if (arm === "treatment" && codedecayHints?.length) {
    lines.push("CodeDecay workflow hints:");
    for (const hint of codedecayHints) lines.push(`- ${hint}`);
  }
  return lines.join("\n");
}
