import type { LoopFormat, LoopReport } from "./types";

export function renderLoopReport(report: LoopReport, format: LoopFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderLoopMarkdown(report);
}

export function renderLoopMarkdown(report: LoopReport): string {
  const lines = [
    "## CodeDecay Loop Report",
    "",
    `**Status:** ${statusLabel(report.status)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Rounds run | ${report.roundsRun} / ${report.maxRounds} |`,
    `| Final risk | ${report.finalRiskLevel} |`,
    `| Final merge risk | ${report.finalMergeRiskScore}/100 |`,
    `| Final security risk | ${report.finalSecurityScore}/100 |`,
    `| Final weak-test findings | ${report.finalWeakTestFindings} |`,
    `| Final check status | ${report.finalCheckStatus} |`,
    "",
    "### Verdict Evidence",
    "",
    "CodeDecay never guarantees a safe merge. This verdict means the configured and enabled checks below found no blocking evidence.",
    "",
    "| Evidence | Value |",
    "| --- | --- |",
    `| Security score threshold | ${report.verdict.securityScoreThreshold}/100 |`,
    `| High findings remaining | ${report.verdict.highFindingCount} |`,
    `| High security findings remaining | ${report.verdict.highSecurityFindingCount} |`,
    `| Security matchers | ${report.verdict.securityMatchersRan ? `${report.verdict.securityMatcherFindings} finding(s)` : "not available"} |`,
    "",
    "**Verified by:**",
    ...bulletLines(report.verdict.verifiedBy, "nothing yet"),
    "",
    "**Missing depth:**",
    ...bulletLines(report.verdict.missingDepth, "none"),
    "",
    "**Blocking reasons:**",
    ...bulletLines(report.verdict.blockingReasons, "none"),
    "",
    "### Rounds",
    "",
    "| Round | Risk | Merge | Weak tests | Checks | Agent |",
    "| ---: | --- | ---: | ---: | --- | --- |"
  ];

  for (const round of report.rounds) {
    lines.push(
      `| ${round.round} | ${round.riskLevel} | ${round.mergeRiskScore}/100 | ${round.weakTestFindings} | ${round.checkStatus} | ${round.agent ? round.agent.status : report.planOnly ? "plan-only" : "not run"} |`
    );
  }

  const agentRounds = report.rounds.filter((round) => round.agent);
  if (agentRounds.length > 0) {
    lines.push("", "### Agent Activity", "");
    for (const round of agentRounds) {
      const agent = round.agent;
      if (!agent) {
        continue;
      }

      lines.push(
        `- Round ${round.round}: \`${agent.command}\` ${agent.status}; changed files: ${
          agent.changedFiles.length > 0 ? agent.changedFiles.map((file) => `\`${file}\``).join(", ") : "none"
        }`
      );
      if (agent.stderr.trim()) {
        lines.push(`  - stderr: ${singleLine(agent.stderr)}`);
      }
    }
  }

  if (report.status === "plan-only") {
    const bundle = report.rounds.find((round) => round.planOnlyBundle)?.planOnlyBundle;
    lines.push("", "### Plan-Only Agent Bundle", "");
    lines.push("No agent command was configured, so CodeDecay did not run an agent or edit files.");
    if (bundle) {
      lines.push("", "<details>", "<summary>Agent bundle that would be sent</summary>", "", "```markdown", bundle.trim(), "```", "", "</details>");
    }
  }

  lines.push("", "### Remaining Fix Tasks", "");
  if (report.finalFixTasks.length === 0) {
    lines.push("- no fix tasks remain");
  } else {
    for (const task of report.finalFixTasks.slice(0, 12)) {
      const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
      lines.push(`- ${task.priority} **${task.title}**${location}: ${task.detail}`);
    }
  }

  lines.push("", "### Next Steps", "");
  for (const step of report.nextSteps) {
    lines.push(`- ${step}`);
  }

  lines.push(
    "",
    "### Safety",
    "",
    `- Agent command configured: ${report.safety.agentCommandConfigured ? "yes" : "no"}`,
    `- Commands executed by CodeDecay: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- LLM/model called by CodeDecay: ${report.safety.llmCalled ? "yes" : "no"}`,
    `- Telemetry sent: ${report.safety.telemetrySent ? "yes" : "no"}`,
    `- Cloud dependency: ${report.safety.cloudDependency ? "yes" : "no"}`,
    `- Auto-committed: ${report.safety.autoCommitted ? "yes" : "no"}`,
    `- Auto-pushed: ${report.safety.autoPushed ? "yes" : "no"}`,
    "",
    "Agent output is untrusted until deterministic CodeDecay analysis and configured checks prove the result."
  );

  return `${lines.join("\n")}\n`;
}

function statusLabel(status: LoopReport["status"]): string {
  return status.replaceAll("-", " ");
}

function bulletLines(values: string[], emptyText: string): string[] {
  if (values.length === 0) {
    return [`- ${emptyText}`];
  }

  return values.map((value) => `- ${value}`);
}

function singleLine(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 500);
}
