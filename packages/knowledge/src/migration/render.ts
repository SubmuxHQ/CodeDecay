import type { MigrationSafetyReport } from "./types";

export function renderMigrationSafetyMarkdown(report: MigrationSafetyReport): string {
  const lines = [
    "## CodeDecay Migration Safety Plan",
    "",
    `Target: \`${report.targetKind}\`; dialect: \`${report.dialect}\`; verdict: \`${report.verdict}\`; fullyVerified: \`${report.fullyVerified}\`.`,
    `Rollback status: \`${report.rollbackStatus}\`; cleanup proven: \`${report.cleanup.proven}\`.`,
    report.connectionTarget ? `Connection target: \`${report.connectionTarget.redacted}\` (${report.connectionTarget.kind}).` : "Connection target: unspecified.",
    "Commands executed: no.",
    "",
    "### Operations",
    ""
  ];
  if (!report.operations.length) lines.push("No migration operation was analyzed.");
  for (const item of report.operations) {
    lines.push(`- **${item.risk}** \`${item.kind}\` ${item.detail} Source: \`${item.sourceRef}\``);
  }
  lines.push("", "### Deployment Matrix", "", "| State | Status | Reason |", "| --- | --- | --- |");
  for (const item of report.matrix) lines.push(`| ${item.state} | ${item.status} | ${item.reason} |`);
  lines.push("", "### Blockers", "");
  if (!report.blockers.length) lines.push("No static blocker was found; execution proof is still required.");
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  lines.push("", "### Cleanup", "");
  lines.push(`- Required: \`${report.cleanup.required}\``);
  lines.push(`- Plan: ${report.cleanup.plan ? `\`${report.cleanup.plan}\`` : "missing"}`);
  lines.push(`- Proven: \`${report.cleanup.proven}\` (required on failure: \`${report.cleanup.requiredOnFailure}\`)`);
  lines.push("", "### Verification Tasks", "");
  for (const task of report.investigationTasks) lines.push(`- ${task}`);
  lines.push("", "### Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return `${lines.join("\n")}\n`;
}
