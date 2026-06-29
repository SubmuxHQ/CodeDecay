import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import { formatRisk, formatTestProofStatus } from "../helpers";

export function appendTestAudit(lines: string[], audit: TestProofAudit): void {
  lines.push("### Test Evidence Audit", "");
  lines.push(`**Status:** ${formatTestProofStatus(audit.status)}`);
  lines.push(`**Summary:** ${audit.summary}`, "");
  lines.push(`**Evidence mode:** ${audit.evidenceMode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"}`);
  lines.push(`**Evidence summary:** ${audit.evidenceSummary}`, "");
  lines.push("| Signal | Count |", "| --- | ---: |");
  lines.push(`| Changed source files | ${audit.changedSourceFiles.length} |`);
  lines.push(`| Changed test files | ${audit.changedTestFiles.length} |`);
  lines.push(`| Missing-test findings | ${audit.missingTestFindings.length} |`);
  lines.push(`| Weak-test findings | ${audit.weakTestFindings.length} |`, "");

  if (audit.missingTestFindings.length === 0 && audit.weakTestFindings.length === 0) {
    lines.push("No missing-test or weak-test findings were detected by deterministic rules or runtime coverage inputs.", "");
  }

  for (const finding of [...audit.missingTestFindings, ...audit.weakTestFindings].slice(0, 10)) {
    const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
    lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
  }

  if (audit.recommendedChecks.length > 0) {
    lines.push("", "Recommended stronger checks:");
    for (const check of audit.recommendedChecks.slice(0, 8)) {
      lines.push(`- ${check}`);
    }
  }

  lines.push("");
}
