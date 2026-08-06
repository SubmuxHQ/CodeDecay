import type { RuntimeEvidenceReport } from "./types";

export function renderRuntimeEvidenceMarkdown(report: RuntimeEvidenceReport): string {
  const lines = [
    "## CodeDecay Runtime Evidence",
    "",
    `Head revision: \`${report.headRevision ?? "unknown"}\``,
    `Provider: \`${report.provider.kind}\``,
    `Can prove current tree: \`${report.canProveCurrentTree}\``,
    `Sources: ${report.sources.length}; spans read: ${report.stats.spansRead}; bounded drops: ${report.stats.spansDroppedByBounds}; malformed: ${report.stats.malformedRecords}`,
    "",
    "### Runtime Operations",
    ""
  ];
  if (report.operations.length === 0) lines.push("No runtime operations were ingested.", "");
  for (const item of report.operations) {
    lines.push(
      `- **${item.service} ${item.route ?? item.operation}** \`${item.evidenceId}\``,
      `  - ${item.spanCount} span(s), ${item.errorCount} error(s), max ${item.maxLatencyMs}ms` +
        (item.latencyBudgetMs ? ` / budget ${item.latencyBudgetMs}ms` : "") +
        `; trust \`${item.trust}\`; provesCurrentTree \`${item.provesCurrentTree}\``,
      `  - Downstream: ${item.downstreamServiceIds.map((id) => `\`${id}\``).join(", ") || "none declared"}`
    );
  }
  lines.push("", "### Correlated Errors", "");
  if (report.errors.length === 0) lines.push("No structured error groups were ingested.", "");
  for (const item of report.errors) {
    lines.push(
      `- **${item.group}** \`${item.evidenceId}\`: ${item.count} event(s) for ${item.service}; trust \`${item.trust}\`` +
        (item.matchingDeploymentId ? `; matching deployment \`${item.matchingDeploymentId}\`` : "") +
        `; source \`${item.sourceRef}\`.`
    );
  }
  lines.push("", "### Deployments", "");
  if (report.deployments.length === 0) lines.push("No deployment events were ingested.", "");
  for (const item of report.deployments) {
    lines.push(`- **${item.service}@${item.revision}** \`${item.evidenceId}\`; trust \`${item.trust}\`.`);
  }
  lines.push("", "### Investigation Tasks", "");
  if (report.investigationTasks.length === 0) lines.push("No runtime investigation task was generated.");
  for (const task of report.investigationTasks) {
    lines.push(
      `- **${task.title}** (${task.priority}) \`${task.evidenceId}\``,
      `  - ${task.detail}`,
      `  - Cited: ${task.citedEvidenceIds.map((id) => `\`${id}\``).join(", ")}`
    );
  }
  lines.push("", "### Limitations", "");
  if (report.limitations.length === 0) lines.push("No ingestion limitation was reported.");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push(
    "",
    "### Safety",
    "",
    "- Local artifact ingestion only; no network or command execution.",
    "- Sensitive attributes, query strings, authorization data, request bodies, tokens, and email addresses are redacted before report assembly.",
    "- Historical or sampled runtime evidence cannot prove the current tree safe.",
    ""
  );
  return `${lines.join("\n")}\n`;
}
