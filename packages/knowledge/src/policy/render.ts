import type { PolicyDecisionReport } from "./types";

export function renderPolicyDecisionMarkdown(report: PolicyDecisionReport): string {
  const lines = [
    "## CodeDecay Engineering Policy Decision",
    "",
    `Decision: \`${report.decisionId}\`; verdict: \`${report.verdict}\`; changeClass: \`${report.changeClass}\`; fullyVerified: \`${report.fullyVerified}\`.`,
    `Changed paths: ${report.changedPaths.length ? report.changedPaths.map((path) => `\`${path}\``).join(", ") : "(none)"}.`,
    "Commands executed: no. Policy downloaded: no. Cryptographic identity: no.",
    "",
    "### Applicable Policies",
    ""
  ];
  if (!report.applicable.length) lines.push("No scoped engineering policy matched.");
  for (const item of report.applicable) {
    lines.push(
      `- \`${item.policy.id}\` (source=${item.policy.source}, precedence=${item.policy.precedence}${item.stale ? ", stale" : ""}) owner=${item.policy.owner}`
    );
  }
  lines.push("", "### Obligations", "");
  if (!report.obligations.length) lines.push("No obligations.");
  for (const obligation of report.obligations) {
    lines.push(`- **${obligation.kind}** (${obligation.policyId}): ${obligation.detail}`);
  }
  lines.push("", "### Approvals / Exceptions", "");
  lines.push(`Approvals: ${report.approvals.length}; exceptions: ${report.exceptions.length}.`);
  for (const approval of report.approvals) {
    lines.push(`- approval \`${approval.id}\` actor=${approval.actor} policy=${approval.policyId} revoked=${approval.revoked}`);
  }
  for (const exception of report.exceptions) {
    lines.push(
      `- exception \`${exception.id}\` actor=${exception.actor} policy=${exception.policyId} expires=${exception.expiresAt} revoked=${exception.revoked}`
    );
  }
  lines.push("", "### Conflicts", "");
  if (!report.conflicts.length) lines.push("No conflicts.");
  for (const conflict of report.conflicts) lines.push(`- ${conflict}`);
  lines.push("", "### Blockers", "");
  if (!report.blockers.length) lines.push("No blockers.");
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  lines.push("", "### Investigation Tasks", "");
  for (const task of report.investigationTasks) lines.push(`- ${task}`);
  lines.push("", "### Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push("", "### Identity", "");
  lines.push(`- ${report.identity.note}`);
  return `${lines.join("\n")}\n`;
}
