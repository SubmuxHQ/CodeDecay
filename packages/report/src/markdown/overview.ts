import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { riskBadge, routeLabel } from "./helpers";

export function appendSummaryTables(lines: string[], report: CodeDecayReport): void {
  lines.push(
    `**Overall risk:** ${riskBadge(report.summary.riskLevel)}`,
    "",
    "| Score | Value |",
    "| --- | ---: |",
    `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${report.summary.decayScore}/100 |`,
    `| Security risk | ${report.summary.securityScore}/100 |`,
    "",
    "| Findings | Count |",
    "| --- | ---: |",
    `| High | ${report.summary.findingCounts.high} |`,
    `| Medium | ${report.summary.findingCounts.medium} |`,
    `| Low | ${report.summary.findingCounts.low} |`,
    ""
  );
}

export function appendChangedFiles(lines: string[], report: CodeDecayReport): void {
  if (report.changedFiles.length === 0) {
    return;
  }

  lines.push("### Changed Files", "");
  for (const file of report.changedFiles.slice(0, 20)) {
    const rename = file.oldPath ? ` from \`${file.oldPath}\`` : "";
    lines.push(`- \`${file.path}\` ${file.status}${rename} (+${file.additions}/-${file.deletions})`);
  }

  if (report.changedFiles.length > 20) {
    lines.push(`- ...and ${report.changedFiles.length - 20} more file(s)`);
  }

  lines.push("");
}

export function appendImpactedAreas(lines: string[], report: CodeDecayReport): void {
  if (report.impactedAreas.length === 0) {
    return;
  }

  lines.push("### Likely Impacted Areas", "");
  for (const area of report.impactedAreas) {
    lines.push(`- ${riskBadge(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push("");
}

export function appendImpactedRoutes(lines: string[], report: CodeDecayReport): void {
  if (!report.impactedRoutes || report.impactedRoutes.length === 0) {
    return;
  }

  lines.push("### Likely Impacted Routes And APIs", "");
  for (const route of report.impactedRoutes) {
    const methods = route.methods.length > 0 ? `${route.methods.join(", ")} ` : "";
    const label = routeLabel(route.framework, route.kind);
    lines.push(
      `- ${riskBadge(route.risk)} \`${methods}${route.route}\` (${label}): ${route.files.map((file) => `\`${file}\``).join(", ")}`
    );
  }
  lines.push("");
}

export function appendRecommendedChecks(lines: string[], report: CodeDecayReport): void {
  if (report.recommendedTests.length === 0) {
    return;
  }

  lines.push("### Recommended Checks", "");
  for (const test of report.recommendedTests.slice(0, 12)) {
    lines.push(`- \`${test}\``);
  }
  lines.push("");
}

export function appendReportNotes(lines: string[]): void {
  lines.push(
    "### Notes",
    "",
    "CodeDecay is deterministic and local-first. This report was generated without telemetry, API keys, LLMs, or model calls.",
    ""
  );
}
