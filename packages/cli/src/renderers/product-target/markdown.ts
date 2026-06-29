import type { ProductTargetReport, ProductTargetResult } from "../../types";
import {
  appendGeneratedApiTestRunSection,
  appendGeneratedApiTestsSection,
  appendGeneratedTestRunSection,
  appendGeneratedTestsSection
} from "./generated";
import { formatProductStatus } from "./format";
import { appendTargetRuntimeSections, appendTargetTeardownAndNotes } from "./lifecycle";
import { appendProductSafetySection } from "./safety";

export function renderProductTargetMarkdown(report: ProductTargetReport): string {
  const lines = [
    "## CodeDecay Product Target Report",
    "",
    `**Overall status:** ${formatProductStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Ready | ${report.summary.ready} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Blocked | ${report.summary.blocked} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.targets.length === 0) {
    lines.push("No product testing targets configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Targets", "");
  for (const target of report.targets) {
    appendTargetSection(lines, target);
  }

  appendProductSafetySection(lines, report);

  return `${lines.join("\n")}\n`;
}

function appendTargetSection(lines: string[], target: ProductTargetResult): void {
  lines.push(`- **${target.id}** ${formatProductStatus(target.status)} in ${target.durationMs}ms`);
  lines.push(`  - Readiness: ${target.readiness.status} (${target.readiness.mode})`);
  lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
  lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);

  appendTargetRuntimeSections(lines, target);

  if (target.generatedTests) {
    appendGeneratedTestsSection(lines, target.generatedTests);
  }

  if (target.generatedTestRun) {
    appendGeneratedTestRunSection(lines, target.generatedTestRun);
  }

  if (target.generatedApiTests) {
    appendGeneratedApiTestsSection(lines, target.generatedApiTests);
  }

  if (target.generatedApiTestRun) {
    appendGeneratedApiTestRunSection(lines, target.generatedApiTestRun);
  }

  appendTargetTeardownAndNotes(lines, target);
}
