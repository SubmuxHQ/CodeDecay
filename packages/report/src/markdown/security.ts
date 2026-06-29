import type { SecurityAnalysisSummary, SecurityCandidate } from "@submuxhq/codedecay-core";
import { riskBadge } from "./helpers";

export function appendSecurityAnalysis(lines: string[], analysis: SecurityAnalysisSummary | undefined): void {
  if (!analysis) {
    return;
  }

  lines.push("### Security Matcher Coverage", "");
  lines.push(`- Changed source files scanned: ${analysis.scannedFiles.length}`);
  lines.push(`- Security candidates found: ${analysis.candidateCount}`);
  lines.push(`- Skipped files: ${analysis.skippedFiles.length}`);

  if (analysis.skippedFiles.length > 0) {
    for (const skipped of analysis.skippedFiles.slice(0, 8)) {
      lines.push(`- Skipped \`${skipped.path}\`: ${skipped.reason}`);
    }
  }

  lines.push("");
}

export function appendSecurityCandidates(lines: string[], candidates: SecurityCandidate[] | undefined): void {
  if (!candidates || candidates.length === 0) {
    return;
  }

  lines.push("### Security Candidates", "");
  for (const candidate of candidates.slice(0, 12)) {
    const location = candidate.line ? `:${candidate.line}` : "";
    const cwe = candidate.cwe ? ` ${candidate.cwe}` : "";
    lines.push(
      `- ${riskBadge(candidate.severity)} **${candidate.title}**${cwe} (${candidate.confidence}) at \`${candidate.file}${location}\`: ${candidate.evidence}`
    );
  }

  if (candidates.length > 12) {
    lines.push(`- ...and ${candidates.length - 12} more security candidate(s)`);
  }

  lines.push("");
}
