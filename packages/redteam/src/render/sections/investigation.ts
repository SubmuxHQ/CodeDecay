import type { RedteamInvestigation } from "../../types";
import { formatRisk } from "../helpers";

export function appendInvestigation(lines: string[], investigation: RedteamInvestigation | undefined): void {
  if (!investigation) {
    return;
  }

  lines.push("### AI Investigation", "");
  lines.push(`**Status:** ${investigation.status}`);
  lines.push(`**Provider:** ${investigation.provider.id ?? investigation.provider.configuredProvider}`);
  lines.push("**Trust:** untrusted suggestions; verify with deterministic checks before acting.", "");

  if (investigation.limitations.length > 0) {
    lines.push("Limitations:");
    for (const limitation of investigation.limitations) {
      lines.push(`- ${limitation}`);
    }
    lines.push("");
  }

  appendSuggestions(lines, investigation);
  appendHypotheses(lines, investigation);
  appendRawText(lines, investigation);
}

function appendSuggestions(lines: string[], investigation: RedteamInvestigation): void {
  if (investigation.suggestions.length === 0) {
    lines.push("No AI suggestions were produced.", "");
    return;
  }

  lines.push("Suggestions:");
  for (const suggestion of investigation.suggestions) {
    const severity = suggestion.severity ? ` (${formatRisk(suggestion.severity)})` : "";
    lines.push(`- **${suggestion.title}**${severity}: ${suggestion.detail}`);
    appendOptionalLine(lines, "Evidence", suggestion.evidence);
    appendOptionalLine(lines, "Affected flows", suggestion.affectedFlows);
    appendOptionalLine(lines, "Edge cases", suggestion.edgeCases);
    appendOptionalLine(lines, "Proposed proof", suggestion.proposedProof);
    appendOptionalLine(lines, "Unresolved questions", suggestion.unresolvedQuestions);
  }
  lines.push("");
}

function appendHypotheses(lines: string[], investigation: RedteamInvestigation): void {
  if (!investigation.hypotheses) {
    return;
  }

  lines.push("Falsifiable hypotheses:");
  if (investigation.hypotheses.hypotheses.length === 0) {
    lines.push("- No schema-valid, evidence-cited hypotheses were produced.");
  }
  for (const hypothesis of investigation.hypotheses.hypotheses) {
    lines.push(`- **${hypothesis.id}** (${hypothesis.status}, ${formatRisk(hypothesis.severitySuggestion)}): ${hypothesis.claim}`);
    lines.push(`  Consequence: ${hypothesis.userVisibleConsequence}`);
    lines.push(`  Evidence: ${hypothesis.evidenceIds.join("; ")}`);
    lines.push(`  Disconfirming result: ${hypothesis.disconfirmingResult}`);
    lines.push(`  Verifier: ${hypothesis.proposedVerifier.kind} - ${hypothesis.proposedVerifier.name}`);
  }
  if (investigation.hypotheses.overflow.length > 0) {
    lines.push(`- ${investigation.hypotheses.overflow.length} additional hypotheses available in JSON output.`);
  }
  if (investigation.hypotheses.rejected.length > 0) {
    lines.push(`- Rejected/degraded provider items: ${investigation.hypotheses.rejected.length}`);
  }
  lines.push("");
}

function appendRawText(lines: string[], investigation: RedteamInvestigation): void {
  if (!investigation.rawText?.trim()) {
    return;
  }

  lines.push("Raw provider response:", "", "```text");
  for (const line of investigation.rawText.trim().split(/\r?\n/).slice(0, 80)) {
    lines.push(line);
  }
  lines.push("```", "");
}

function appendOptionalLine(lines: string[], label: string, values: string[] | undefined): void {
  if (values?.length) {
    lines.push(`  ${label}: ${values.join("; ")}`);
  }
}
