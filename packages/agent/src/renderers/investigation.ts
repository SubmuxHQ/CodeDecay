import type { RedteamInvestigation } from "@submuxhq/codedecay-redteam";

export function appendInvestigationHypotheses(lines: string[], investigation: RedteamInvestigation): void {
  if (!investigation.hypotheses) {
    return;
  }

  lines.push("", "Falsifiable hypotheses:");
  for (const hypothesis of investigation.hypotheses.hypotheses) {
    lines.push(`- ${hypothesis.id} (${hypothesis.status}): ${hypothesis.claim} Consequence: ${hypothesis.userVisibleConsequence} Evidence: ${hypothesis.evidenceIds.join(", ")} Disconfirming result: ${hypothesis.disconfirmingResult} Verifier: ${hypothesis.proposedVerifier.kind} - ${hypothesis.proposedVerifier.name}.`);
  }
  if (investigation.hypotheses.overflow.length > 0) {
    lines.push(`- ${investigation.hypotheses.overflow.length} additional hypotheses available in JSON output.`);
  }
}
