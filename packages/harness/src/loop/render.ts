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
    ...(report.stopReason ? [`**Stop reason:** ${report.stopReason}`] : []),
    ...(report.auditPath ? [`**Audit:** \`${report.auditPath}\``] : []),
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Rounds run | ${report.roundsRun} / ${report.maxRounds} |`,
    `| Final risk | ${report.finalRiskLevel} |`,
    `| Final merge risk | ${report.finalMergeRiskScore}/100 |`,
    `| Final decay risk | ${report.finalDecayScore}/100 |`,
    `| Final security risk | ${report.finalSecurityScore}/100 |`,
    `| Final weak-test findings | ${report.finalWeakTestFindings} |`,
    `| Final product failure bundles | ${report.finalProductFailureBundles} |`,
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
    "| Round | Risk | Merge | Decay | Security | Weak tests | Product failures | Checks | Agent |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |"
  ];

  appendRoundTable(lines, report);
  appendRoles(lines, report);
  appendStateMachine(lines, report);
  appendRequirementTrace(lines, report);
  appendAgentActivity(lines, report);
  appendPlanOnlyBundle(lines, report);
  appendFixTasks(lines, report);
  appendNextSteps(lines, report);

  lines.push(
    "",
    "### Safety",
    "",
    `- Builder command configured: ${report.safety.builderCommandConfigured ? "yes" : "no"}`,
    `- Verifier command configured: ${report.safety.verifierCommandConfigured ? "yes" : "no"}`,
    `- Legacy agent command configured: ${report.safety.agentCommandConfigured ? "yes" : "no"}`,
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

function appendRoles(lines: string[], report: LoopReport): void {
  lines.push(
    "",
    "### Roles",
    "",
    "| Role | Identity | Command | Can edit | Can verify criteria |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const role of report.roles) {
    lines.push(
      `| ${role.role} | ${role.id} | ${role.commandConfigured ? "configured" : "not configured"} | ${role.canEdit ? "yes" : "no"} | ${role.canVerifyCriteria ? "yes" : "no"} |`
    );
  }
}

function appendStateMachine(lines: string[], report: LoopReport): void {
  lines.push(
    "",
    "### Loop State",
    "",
    `- Schema: ${report.stateMachine.schemaVersion}`,
    `- Phase: ${report.stateMachine.phase}`,
    `- Changed-tree fingerprint: \`${report.stateMachine.changedTreeFingerprint}\``
  );
  if (report.stateMachine.unresolvedHumanDecisions.length > 0) {
    lines.push("- Unresolved human decisions:");
    lines.push(...report.stateMachine.unresolvedHumanDecisions.map((decision) => `  - ${decision}`));
  }
}

function appendRequirementTrace(lines: string[], report: LoopReport): void {
  if (!report.requirementTrace) {
    return;
  }
  lines.push(
    "",
    "### Acceptance Criteria Trace",
    "",
    "| Requirement | Status |",
    "| --- | --- |"
  );
  for (const criterion of report.requirementTrace.criteria) {
    lines.push(`| ${criterion.requirementId} | ${criterion.status.replaceAll("-", " ")} |`);
  }
}

function appendRoundTable(lines: string[], report: LoopReport): void {
  for (const round of report.rounds) {
    const agentStatus = round.agent?.status ?? (report.planOnly ? "plan-only" : "not run");
    lines.push(
      `| ${round.round} | ${round.riskLevel} | ${round.mergeRiskScore}/100 | ${round.decayScore}/100 | ${round.securityScore}/100 | ${round.weakTestFindings} | ${round.productFailureBundles} | ${round.checkStatus} | ${agentStatus} |`
    );
  }
}

function appendAgentActivity(lines: string[], report: LoopReport): void {
  const agentRounds = report.rounds.filter((round) => round.agent);
  if (agentRounds.length === 0) {
    return;
  }

  lines.push("", "### Agent Activity", "");
  for (const round of agentRounds) {
    const agent = round.agent;
    if (!agent) {
      continue;
    }

    const changedFiles = agent.changedFiles.length > 0
      ? agent.changedFiles.map((file) => `\`${file}\``).join(", ")
      : "none";
    lines.push(`- Round ${round.round}: \`${agent.command}\` ${agent.status}; changed files: ${changedFiles}`);
    if (round.postAgentVerification) {
      const verification = round.postAgentVerification;
      lines.push(
        `  - Post-agent verification: ${verification.riskLevel} risk, merge ${verification.mergeRiskScore}/100, checks ${verification.checkStatus}.`
      );
    }
    if (agent.stderr.trim()) {
      lines.push(`  - stderr: ${singleLine(agent.stderr)}`);
    }
  }
}

function appendPlanOnlyBundle(lines: string[], report: LoopReport): void {
  if (report.status !== "plan-only") {
    return;
  }

  const bundle = report.rounds.find((round) => round.planOnlyBundle)?.planOnlyBundle;
  lines.push(
    "",
    "### Plan-Only Agent Bundle",
    "",
    "No agent command was configured, so CodeDecay did not run an agent or edit files."
  );
  if (bundle) {
    lines.push("", "<details>", "<summary>Agent bundle that would be sent</summary>", "", "```markdown", bundle.trim(), "```", "", "</details>");
  }
}

function appendFixTasks(lines: string[], report: LoopReport): void {
  lines.push("", "### Remaining Fix Tasks", "");
  if (report.finalFixTasks.length === 0) {
    lines.push("- no fix tasks remain");
    return;
  }

  for (const task of report.finalFixTasks.slice(0, 12)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(`- ${task.priority} **${task.title}**${location}: ${task.detail}`);
  }
}

function appendNextSteps(lines: string[], report: LoopReport): void {
  lines.push("", "### Next Steps", "");
  for (const step of report.nextSteps) {
    lines.push(`- ${step}`);
  }
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
