import type { StateSpaceSafetyReport } from "./types";

export function renderStateSpaceSafetyMarkdown(report: StateSpaceSafetyReport): string {
  const lines = [
    "## CodeDecay State-Space Safety",
    "",
    `Verdict: \`${report.verdict}\`; fullyVerified: \`${report.fullyVerified}\`; tree: \`${report.treeStatus}\`.`,
    report.experimentId
      ? `Experiment: \`${report.experimentId}\` (${report.experimentKind ?? "unknown"}).`
      : "Experiment: none supplied.",
    `Bounds: dimensions≤${report.bounds.maxDimensions}, combinations≤${report.bounds.maxCombinations}, timeoutMs=${report.bounds.timeoutMs}, target=${report.bounds.targetKind}.`,
    `Coverage: tested=${report.coverage.testedCount}, failed=${report.coverage.failedCount}, skipped=${report.coverage.skippedCount}, untested=${report.coverage.untestedCount}, pruned=${report.coverage.prunedCount}; exhaustive=\`${report.coverage.exhaustive}\`.`,
    "Commands executed: no. Remote flag provider contacted: " +
      (report.safety.remoteFlagProviderContacted ? "yes (configured)." : "no."),
    "",
    "### Dimensions",
    ""
  ];
  if (!report.dimensions.length) lines.push("No explicit dimensions were supplied.");
  for (const dim of report.dimensions) {
    lines.push(`- \`${dim.id}\` (${dim.kind}): ${dim.values.map((value) => `\`${value}\``).join(", ")} — ${dim.note}`);
  }

  lines.push("", "### Combinations", "");
  if (!report.combinations.length) lines.push("No combinations were generated.");
  for (const combination of report.combinations) {
    const values = Object.entries(combination.values)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    lines.push(
      `- \`${combination.id}\` ${combination.selected ? "selected" : "pruned"}: ${values}${combination.exclusionReason ? ` (${combination.exclusionReason})` : ""}`
    );
  }

  lines.push("", "### Oracle", "");
  if (!report.oracle) lines.push("No oracle was evaluated.");
  else {
    lines.push(`Verdict \`${report.oracle.verdict}\`; seed=${report.oracle.seed}; tool=${report.oracle.toolVersion}.`);
    for (const result of report.oracle.combinationResults) {
      lines.push(`- ${result.status} \`${result.combinationId}\`: ${result.detail}`);
    }
  }

  lines.push("", "### Candidates", "");
  if (!report.candidates.length) lines.push("No keyword candidates were detected.");
  for (const candidate of report.candidates) {
    lines.push(`- \`${candidate.kind}\` \`${candidate.surface}\` — ${candidate.note}`);
  }

  lines.push("", "### Repair Tasks", "");
  if (!report.repairTasks.length) lines.push("No repair task was generated.");
  for (const task of report.repairTasks) lines.push(`- **${task.title}**: ${task.detail}`);

  lines.push("", "### Blockers", "");
  if (!report.blockers.length) lines.push("No blocker.");
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);

  lines.push("", "### Cleanup", "");
  lines.push(`- Required: \`${report.cleanup.required}\``);
  lines.push(`- Plan: ${report.cleanup.plan ? `\`${report.cleanup.plan}\`` : "missing"}`);
  lines.push(`- Proven: \`${report.cleanup.proven}\``);

  lines.push("", "### Extension Boundaries", "");
  for (const boundary of report.extensionBoundaries) {
    lines.push(`- \`${boundary.id}\` (${boundary.status}): ${boundary.detail}`);
  }

  lines.push("", "### Investigation Tasks", "");
  for (const task of report.investigationTasks) lines.push(`- ${task}`);

  lines.push("", "### Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return `${lines.join("\n")}\n`;
}
