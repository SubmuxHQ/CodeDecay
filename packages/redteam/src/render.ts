import type {
  RedteamFormat,
  RedteamReport,
} from "./types";
import { formatRisk } from "./render/helpers";
import {
  appendConfiguredChecks,
  appendEdgeCases,
  appendFixTasks,
  appendImpactedAreas,
  appendImpactedRoutes,
  appendInvestigation,
  appendMemorySummary,
  appendProductFailures,
  appendSkills,
  appendTestAudit,
  appendToolAdapterPlans
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
    `| Missing-test findings | ${report.summary.missingTestFindings} |`,
    `| Weak-test findings | ${report.summary.weakTestFindings} |`,
    `| Edge cases suggested | ${report.summary.edgeCases} |`,
    `| Configured checks listed | ${report.summary.configuredChecks} |`,
    `| Tool adapters planned | ${report.summary.toolAdapters} |`,
    `| Product failure bundles | ${report.summary.productFailureBundles} |`,
    ""
  ];

  appendImpactedAreas(lines, report.analysis.impactedAreas);
  appendImpactedRoutes(lines, report.analysis.impactedRoutes ?? []);
  appendTestAudit(lines, report.testAudit);
  appendProductFailures(lines, report.analysis.productFailureBundles ?? []);
  appendEdgeCases(lines, report.edgeCases);
  appendConfiguredChecks(lines, report.configuredChecks);
  appendToolAdapterPlans(lines, report.toolAdapterPlans);
  appendInvestigation(lines, report.investigation);
  appendFixTasks(lines, report.fixTasks);
  appendMemorySummary(lines, report.memory);
  appendSkills(lines, report.skills);

  lines.push(
    "### Safety",
    "",
    "- Commands executed: no",
    `- LLM/model called: ${report.safety.llmCalled ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    "",
    "CodeDecay separates deterministic tool evidence from AI suggestions. This command produces local evidence and fix tasks that your own agent can use.",
    ""
  );

  return `${lines.join("\n")}\n`;
}
