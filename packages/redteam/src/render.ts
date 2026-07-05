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
    `| Missing-test findings | ${report.summary.missingTestFindings} |`,
    `| Weak-test findings | ${report.summary.weakTestFindings} |`,
    `| Edge cases suggested | ${report.summary.edgeCases} |`,
    `| Configured checks listed | ${report.summary.configuredChecks} |`,
    `| Tool adapters planned | ${report.summary.toolAdapters} |`,
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

  appendImpactedAreas(lines, report.analysis.impactedAreas);
  appendImpactedRoutes(lines, report.analysis.impactedRoutes ?? []);
  appendSymbolImpacts(lines, report.analysis.symbolImpacts ?? []);
  appendTestAudit(lines, report.testAudit);
  appendVerification(lines, report.verification);
  appendProductFailures(lines, report.analysis.productFailureBundles ?? []);
  appendEdgeCases(lines, report.edgeCases);
  appendPatternInsights(lines, report.patternInsights);
  appendConfiguredChecks(lines, report.configuredChecks);
  appendToolAdapterPlans(lines, report.toolAdapterPlans);
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
