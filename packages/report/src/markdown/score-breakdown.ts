import type { ScoreBreakdown } from "@submuxhq/codedecay-core";
import { riskBadge } from "./helpers";

export function appendScoreBreakdown(lines: string[], title: string, breakdown: ScoreBreakdown | undefined): void {
  if (!breakdown) {
    return;
  }

  lines.push(`### ${title}`, "");
  lines.push(`- Score: ${breakdown.score}/100`);
  lines.push(`- Raw score before dampeners: ${breakdown.rawScore}/100`);
  lines.push(`- Adjusted score before severity cap: ${breakdown.adjustedScore}/100`);
  if (breakdown.highestSeverity) {
    lines.push(`- Highest contributing severity: ${riskBadge(breakdown.highestSeverity)}`);
  }
  if (breakdown.heuristicOnly) {
    lines.push("- Evidence mode: heuristic-only");
  }
  lines.push("");

  if (breakdown.contributors.length > 0) {
    lines.push("Top contributors:");
    for (const contributor of breakdown.contributors.slice(0, 5)) {
      lines.push(`- +${contributor.points} ${contributor.label} (${contributor.evidence}): ${contributor.reason}`);
    }
    lines.push("");
  }

  if (breakdown.dampeners.length > 0) {
    lines.push("Dampeners:");
    for (const dampener of breakdown.dampeners.slice(0, 4)) {
      lines.push(`- ${dampener.points} ${dampener.label}: ${dampener.reason}`);
    }
    lines.push("");
  }

  if (breakdown.notes.length > 0) {
    lines.push("Notes:");
    for (const note of breakdown.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }
}
