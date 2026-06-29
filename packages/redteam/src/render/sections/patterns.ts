import type { RedteamPatternInsight } from "../../types";

export function appendPatternInsights(lines: string[], patterns: RedteamPatternInsight[]): void {
  lines.push("### Pattern Intelligence", "");
  if (patterns.length === 0) {
    lines.push("No local pattern-pack matches were found for this PR.", "");
    return;
  }

  lines.push("Pattern-pack guidance is local curated context, not proof. Verify with tests, tools, or human review.", "");

  for (const pattern of patterns.slice(0, 8)) {
    lines.push(`- **${pattern.title}** (\`${pattern.id}\`)`);
    lines.push(`  - Trust: ${pattern.trust}; proof: ${pattern.proof}`);
    lines.push(`  - Areas: ${pattern.areas.join(", ")}`);
    if (pattern.edgeCases[0]) {
      lines.push(`  - Edge case: ${pattern.edgeCases[0]}`);
    }
    if (pattern.weakTestSigns[0]) {
      lines.push(`  - Weak-test sign: ${pattern.weakTestSigns[0]}`);
    }
    if (pattern.suggestedChecks[0]) {
      lines.push(`  - Suggested check: ${pattern.suggestedChecks[0]}`);
    }
    if (pattern.citations.length > 0) {
      lines.push(`  - Source: ${pattern.citations.map((citation) => `${citation.title} (${citation.url})`).join("; ")}`);
    }
  }

  lines.push("");
}
