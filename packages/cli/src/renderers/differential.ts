import type { ConfigFormat, DifferentialReport, DifferentialSideResult, DifferentialStatus } from "../types";
import { appendOutputBlock, formatStatus } from "./command-output";

export function renderDifferentialReport(report: DifferentialReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderDifferentialMarkdown(report);
}

function renderDifferentialMarkdown(report: DifferentialReport): string {
  const lines = [
    "## CodeDecay Differential Report",
    "",
    `**Overall status:** ${formatDifferentialStatus(report.summary.status)}`,
    `**Base:** \`${report.base}\``,
    `**Head:** \`${report.head}\``,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Unchanged | ${report.summary.unchanged} |`,
    `| Changed | ${report.summary.changed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.results.length === 0) {
    lines.push("No configured probes found.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Probe Results", "");
  for (const result of report.results) {
    lines.push(`- **${result.name}** ${formatDifferentialStatus(result.status)}: \`${result.command}\``);

    if (result.differences.length > 0) {
      lines.push(`  - Differences: ${result.differences.join("; ")}`);
    }

    lines.push(`  - Base: ${formatStatus(result.base.status)}${formatSideExitCode(result.base)}`);
    lines.push(`  - Head: ${formatStatus(result.head.status)}${formatSideExitCode(result.head)}`);

    if (result.status === "changed" || result.status === "failed") {
      appendOutputBlock(lines, "base stdout", result.base.stdout);
      appendOutputBlock(lines, "head stdout", result.head.stdout);
      appendOutputBlock(lines, "base stderr", result.base.stderr);
      appendOutputBlock(lines, "head stderr", result.head.stderr);
    }
  }

  lines.push(
    "",
    "### Notes",
    "",
    "CodeDecay runs only configured probes from CodeDecay config on temporary git worktrees, then removes those worktrees.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function formatSideExitCode(side: DifferentialSideResult): string {
  return side.exitCode === undefined ? "" : `, exit ${side.exitCode}`;
}

function formatDifferentialStatus(status: DifferentialStatus): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
