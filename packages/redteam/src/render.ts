import type {
  RedteamFormat,
  RedteamReport,
} from "./types";
import { formatRisk } from "./render/helpers";
import {
  appendConfiguredChecks,
  appendEdgeCases,
  appendExperimentPlans,
  appendFixTasks,
  appendImpactGraph,
  appendImpactedAreas,
  appendImpactedRoutes,
  appendSymbolImpacts,
  appendInvestigation,
  appendMemorySummary,
  appendPatternInsights,
  appendProductFailures,
  appendSkills,
  appendTestAudit,
  appendToolAdapterPlans,
  appendVerification
} from "./render/sections";

export function renderRedteamReport(report: RedteamReport, format: RedteamFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderRedteamMarkdown(report);
}

export function renderRedteamMarkdown(report: RedteamReport): string {
  const lines: string[] = [
    "## CodeDecay Redteam Report",
    "",
    `**Mode:** ${report.mode}`,
    `**Overall risk:** ${formatRisk(report.summary.riskLevel)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${report.summary.decayScore}/100 |`,
    `| Security risk | ${report.summary.securityScore}/100 |`,
    `| Changed files | ${report.summary.changedFiles} |`,
    `| Impacted areas | ${report.summary.impactedAreas} |`,
    `| Impacted routes/APIs | ${report.summary.impactedRoutes} |`,
    `| Symbol impacts | ${report.summary.symbolImpacts} |`,
    `| Changed path proof entries | ${report.summary.testProofEntries} |`,
    `| Missing-test findings | ${report.summary.missingTestFindings} |`,
    `| Weak-test findings | ${report.summary.weakTestFindings} |`,
    `| Behavior scenarios | ${report.summary.edgeCases} |`,
    `| Ranked scenarios shown | ${report.summary.edgeCasesShown} |`,
    `| Scenario overflow | ${report.summary.edgeCaseOverflow} |`,
    `| Configured checks listed | ${report.summary.configuredChecks} |`,
    `| Tool adapters planned | ${report.summary.toolAdapters} |`,
    `| Experiment plans | ${report.summary.experimentPlans} |`,
    `| Verification status | ${report.summary.verificationStatus} |`,
    `| Pattern insights | ${report.summary.patternInsights} |`,
    `| Product failure bundles | ${report.summary.productFailureBundles} |`,
    ""
  ];

  if (report.summary.changedFiles === 0) {
    lines.push(
      "**No changed files were detected.** CodeDecay did not generate PR fix tasks because there is no diff to red-team.",
      ""
    );
  }

  appendRequirements(lines, report);
  appendRequirementTrace(lines, report);
  appendImpactedAreas(lines, report.analysis.impactedAreas);
  appendImpactedRoutes(lines, report.analysis.impactedRoutes ?? []);
  appendImpactGraph(lines, report.analysis.impactGraph);
  appendSymbolImpacts(lines, report.analysis.symbolImpacts ?? []);
  appendTestAudit(lines, report.testAudit);
  appendVerification(lines, report.verification);
  appendProductFailures(lines, report.analysis.productFailureBundles ?? []);
  appendEdgeCases(lines, report.edgeCases, report.edgeCaseOverflow.length);
  appendPatternInsights(lines, report.patternInsights);
  appendConfiguredChecks(lines, report.configuredChecks);
  appendToolAdapterPlans(lines, report.toolAdapterPlans);
  appendExperimentPlans(lines, report.experimentPlans);
  appendInvestigation(lines, report.investigation);
  appendFixTasks(lines, report.fixTasks);
  appendMemorySummary(lines, report.memory);
  appendSkills(lines, report.skills);

  lines.push(
    "### Safety",
    "",
    `- Commands executed: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- LLM/model called: ${report.safety.llmCalled ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    "",
    "CodeDecay separates tool evidence, deterministic signals, missing proof, memory context, and agent suggestions. Agent/model output is not trusted evidence unless verified by tests or tool output.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function appendRequirementTrace(lines: string[], report: RedteamReport): void {
  if (!report.requirementTrace) {
    return;
  }
  lines.push(
    "### Acceptance Criteria Trace",
    "",
    "| Requirement | Status | Implementation | Evidence |",
    "| --- | --- | --- | --- |"
  );
  for (const criterion of report.requirementTrace.criteria) {
    const implementation = [
      ...criterion.implementation.routes,
      ...criterion.implementation.files
    ].slice(0, 3).join(", ") || "none";
    const evidence = criterion.evidence
      .filter((item) => item.outcome === "passed" || item.outcome === "failed" || item.outcome === "missing")
      .slice(0, 2)
      .map((item) => item.source)
      .join(", ") || "mapping only";
    const label = criterion.status.replaceAll("-", " ");
    const status = `${label[0]?.toUpperCase() ?? ""}${label.slice(1)}`;
    lines.push(`| ${criterion.requirementId} | ${status} | ${implementation} | ${evidence} |`);
  }
  lines.push("");
}

function appendRequirements(lines: string[], report: RedteamReport): void {
  if (!report.requirements) {
    return;
  }
  lines.push("### Requirement Evidence", "", "Acceptance criteria:");
  if (report.requirements.acceptanceCriteria.length === 0) {
    lines.push("- none supplied");
  } else {
    for (const criterion of report.requirements.acceptanceCriteria) {
      lines.push(`- ${criterion.id}: ${criterion.text} [sources: ${criterion.sourceIds.join(", ")}]`);
    }
  }
  lines.push("");
}
