import type {
  CodeDecayReport,
} from "@submuxhq/codedecay-core";
import { riskBadge, routeLabel } from "./markdown/helpers";
import {
  appendFindings,
  appendProductFailureBundles,
  appendScoreBreakdown,
  appendTestEvidence
} from "./markdown/sections";

export function renderMarkdownReport(report: CodeDecayReport): string {
  const highFindings = report.findings.filter((finding) => finding.severity === "high");
  const mediumFindings = report.findings.filter((finding) => finding.severity === "medium");
  const lowFindings = report.findings.filter((finding) => finding.severity === "low");

  const lines: string[] = [
    "## CodeDecay Report",
    "",
    `**Overall risk:** ${riskBadge(report.summary.riskLevel)}`,
    "",
    "| Score | Value |",
    "| --- | ---: |",
    `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${report.summary.decayScore}/100 |`,
    "",
    "| Findings | Count |",
    "| --- | ---: |",
    `| High | ${report.summary.findingCounts.high} |`,
    `| Medium | ${report.summary.findingCounts.medium} |`,
    `| Low | ${report.summary.findingCounts.low} |`,
    ""
  ];

  if (report.changedFiles.length > 0) {
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

  if (report.impactedAreas.length > 0) {
    lines.push("### Likely Impacted Areas", "");
    for (const area of report.impactedAreas) {
      lines.push(`- ${riskBadge(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
    }
    lines.push("");
  }

  if (report.impactedRoutes && report.impactedRoutes.length > 0) {
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

  appendScoreBreakdown(lines, "Merge Risk Breakdown", report.summary.mergeRiskBreakdown);
  appendScoreBreakdown(lines, "Decay Risk Breakdown", report.summary.decayBreakdown);
  appendTestEvidence(lines, report.testEvidence);
  appendProductFailureBundles(lines, report.productFailureBundles);

  appendFindings(lines, "High Risk Findings", highFindings);
  appendFindings(lines, "Medium Risk Findings", mediumFindings);
  appendFindings(lines, "Low Risk Findings", lowFindings);

  if (report.recommendedTests.length > 0) {
    lines.push("### Recommended Checks", "");
    for (const test of report.recommendedTests.slice(0, 12)) {
      lines.push(`- \`${test}\``);
    }
    lines.push("");
  }

  lines.push(
    "### Notes",
    "",
    "CodeDecay is deterministic and local-first. This report was generated without telemetry, API keys, LLMs, or model calls.",
    ""
  );

  return `${lines.join("\n")}\n`;
}
