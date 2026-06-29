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

  if (investigation.suggestions.length === 0) {
    lines.push("No AI suggestions were produced.", "");
  } else {
    lines.push("Suggestions:");
    for (const suggestion of investigation.suggestions) {
      const severity = suggestion.severity ? ` (${formatRisk(suggestion.severity)})` : "";
      lines.push(`- **${suggestion.title}**${severity}: ${suggestion.detail}`);
      if (suggestion.evidence && suggestion.evidence.length > 0) {
        lines.push(`  Evidence: ${suggestion.evidence.join("; ")}`);
      }
    }
    lines.push("");
  }

  if (investigation.rawText?.trim()) {
    lines.push("Raw provider response:", "", "```text");
    for (const line of investigation.rawText.trim().split(/\r?\n/).slice(0, 80)) {
      lines.push(line);
    }
    lines.push("```", "");
  }
}
