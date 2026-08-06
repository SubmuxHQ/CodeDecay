import type { ConcurrencySafetyReport } from "./types";

export function renderConcurrencySafetyMarkdown(report: ConcurrencySafetyReport): string {
  const lines = [
    "## CodeDecay Concurrency Safety",
    "",
    `Verdict: \`${report.verdict}\`; fullyVerified: \`${report.fullyVerified}\`; tree: \`${report.treeStatus}\`.`,
    report.experimentId
      ? `Experiment: \`${report.experimentId}\` (${report.experimentKind ?? "unknown"}); invariant: \`${report.invariant ?? "n/a"}\`.`
      : "Experiment: none supplied.",
    `Bounds: parallelism=${report.bounds.maxParallelism}, repetitions=${report.bounds.repetitions}, timeoutMs=${report.bounds.timeoutMs}, target=${report.bounds.targetKind}.`,
    "Commands executed: no. Scheduler spawned: no. Network called: no.",
    "",
    "### Candidates",
    ""
  ];
  if (!report.candidates.length) lines.push("No concurrency candidates were detected from supplied surfaces.");
  for (const candidate of report.candidates) {
    lines.push(
      `- \`${candidate.kind}\` \`${candidate.surface}\` → invariant \`${candidate.suggestedInvariant}\` (${candidate.note})`
    );
  }

  lines.push("", "### Oracle", "");
  if (!report.oracle) {
    lines.push("No oracle was evaluated.");
  } else {
    lines.push(
      `Verdict \`${report.oracle.verdict}\`; sideEffects=${report.oracle.sideEffectCount}; finalState=${report.oracle.finalState}; seed=${report.oracle.seed}; tool=${report.oracle.toolVersion}.`
    );
    for (const event of report.oracle.timeline) {
      lines.push(
        `- t=${event.at} actor=${event.actor} op=${event.operationId} attempt=${event.attemptId} Δ=${event.sideEffectDelta} state ${event.stateBefore}→${event.stateAfter}${event.barrier ? ` barrier=${event.barrier}` : ""}`
      );
    }
    for (const failure of report.oracle.failures) lines.push(`- failure: ${failure}`);
  }

  lines.push("", "### Repair Tasks", "");
  if (!report.repairTasks.length) lines.push("No repair task was generated.");
  for (const task of report.repairTasks) {
    lines.push(`- **${task.title}**: ${task.detail}`);
  }

  lines.push("", "### Blockers", "");
  if (!report.blockers.length) lines.push("No bound or cleanup blocker.");
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
