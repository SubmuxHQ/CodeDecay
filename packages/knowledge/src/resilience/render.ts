import type { ResilienceSafetyReport } from "./types";

export function renderResilienceSafetyMarkdown(report: ResilienceSafetyReport): string {
  const lines = [
    "## CodeDecay Resilience Safety",
    "",
    `Verdict: \`${report.verdict}\`; fullyVerified: \`${report.fullyVerified}\`; tree: \`${report.treeStatus}\`.`,
    report.experimentId
      ? `Experiment: \`${report.experimentId}\` (${report.experimentKind ?? "unknown"}).`
      : "Experiment: none supplied.",
    `Bounds: retries≤${report.bounds.maxRetries}, requests≤${report.bounds.maxRequests}, timeoutMs=${report.bounds.timeoutMs}, faultDuration≤${report.bounds.maxFaultDurationMs}, target=${report.bounds.targetKind}.`,
    `Coverage: tested=${report.coverage.testedCount}, failed=${report.coverage.failedCount}, untested=${report.coverage.untestedCount}; exhaustive=\`${report.coverage.exhaustive}\`.`,
    "Commands executed: no. Chaos injected: no. Network called: no.",
    "",
    "### Matrix Cells",
    ""
  ];
  if (!report.cells.length) lines.push("No matrix cells.");
  for (const cell of report.cells) {
    lines.push(
      `- \`${cell.id}\` ${cell.selected ? "selected" : "pruned"} producer=${cell.producerVersion} consumer=${cell.consumerVersion} fault=${cell.fault}`
    );
  }
  lines.push("", "### Results", "");
  if (!report.cellResults.length) lines.push("No oracle results.");
  for (const result of report.cellResults) {
    lines.push(
      `- ${result.status} \`${result.cellId}\`: ${result.detail} (sideEffects=${result.sideEffectCount}, retries=${result.retryCount}, recovered=${result.recovered})`
    );
  }
  lines.push("", "### Candidates", "");
  if (!report.candidates.length) lines.push("No candidates.");
  for (const c of report.candidates) lines.push(`- \`${c.suggestedFault}\` \`${c.surface}\` — ${c.note}`);
  lines.push("", "### Repair Tasks", "");
  if (!report.repairTasks.length) lines.push("No repair task.");
  for (const t of report.repairTasks) lines.push(`- **${t.title}**: ${t.detail}`);
  lines.push("", "### Blockers", "");
  if (!report.blockers.length) lines.push("No blocker.");
  for (const b of report.blockers) lines.push(`- ${b}`);
  lines.push("", "### Cleanup", "");
  lines.push(`- Required: \`${report.cleanup.required}\`; plan: ${report.cleanup.plan ? `\`${report.cleanup.plan}\`` : "missing"}; recovered: \`${report.cleanup.recovered}\``);
  lines.push("", "### Extension Boundaries", "");
  for (const b of report.extensionBoundaries) lines.push(`- \`${b.id}\` (${b.status}): ${b.detail}`);
  lines.push("", "### Investigation Tasks", "");
  for (const t of report.investigationTasks) lines.push(`- ${t}`);
  lines.push("", "### Limitations", "");
  for (const l of report.limitations) lines.push(`- ${l}`);
  return `${lines.join("\n")}\n`;
}
