import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import type { ChangedPathTestProofStatus } from "@submuxhq/codedecay-core";
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
  lines.push(`| Changed path proof entries | ${audit.proofMap?.entries.length ?? 0} |`);
  lines.push(`| Missing-test findings | ${audit.missingTestFindings.length} |`);
  lines.push(`| Weak-test findings | ${audit.weakTestFindings.length} |`, "");

  appendChangedPathProof(lines, audit);

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

function appendChangedPathProof(lines: string[], audit: TestProofAudit): void {
  const proofMap = audit.proofMap;
  if (!proofMap || proofMap.entries.length === 0) {
    return;
  }

  lines.push("Changed path proof map:");
  for (const entry of proofMap.entries.slice(0, 8)) {
    const target = entry.symbol ? `${entry.file}#${entry.symbol}` : entry.file;
    lines.push(`- **${formatProofStatus(entry.status)}** \`${target}\` (${entry.evidence}, ${entry.proof})`);
    for (const reason of entry.reasons.slice(0, 2)) {
      lines.push(`  - Evidence: ${reason}`);
    }
    lines.push(`  - Repair task: ${entry.repairTask}`);
  }
  lines.push("");
}

function formatProofStatus(status: ChangedPathTestProofStatus): string {
  switch (status) {
    case "proven_by_runtime_coverage":
      return "runtime-proven";
    case "referenced_only_statically":
      return "static-only";
    case "weakened_by_mocking":
      return "weakened-by-mocking";
    case "unproven":
      return "unproven";
  }
}
