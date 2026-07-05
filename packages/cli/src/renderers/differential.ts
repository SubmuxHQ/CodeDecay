import type { ConfigFormat, DifferentialApiContractResult, DifferentialReport, DifferentialSideResult, DifferentialStatus } from "../types";
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
    `| API contracts | ${report.summary.apiContracts.total} |`,
    `| Breaking API contract changes | ${report.summary.apiContracts.breakingChanges} |`,
    `| Non-breaking API contract changes | ${report.summary.apiContracts.nonBreakingChanges} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.results.length === 0 && report.apiContracts.length === 0) {
    lines.push("No configured probes or API contracts found.", "");
    return `${lines.join("\n")}\n`;
  }

  appendProbeResults(lines, report);
  appendApiContractResults(lines, report.apiContracts);

  lines.push(
    "",
    "### Notes",
    "",
    "CodeDecay runs only configured probes from CodeDecay config on temporary git worktrees, then removes those worktrees.",
    "API contract diffing reads configured local OpenAPI files from those same base/head worktrees and does not execute project commands.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function appendProbeResults(lines: string[], report: DifferentialReport): void {
  if (report.results.length === 0) {
    lines.push("### Probe Results", "", "No configured probes found.", "");
    return;
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

    lines.push(`  - Rerun: \`${result.rerunCommand}\``);
    if (result.artifacts) {
      lines.push(
        `  - Artifacts: \`${result.artifacts.directory}\``,
        `    - Base result: \`${result.artifacts.baseResult}\``,
        `    - Head result: \`${result.artifacts.headResult}\``
      );
    }
  }
  lines.push("");
}

function appendApiContractResults(lines: string[], apiContracts: DifferentialApiContractResult[]): void {
  if (apiContracts.length === 0) {
    lines.push("### API Contract Results", "", "No OpenAPI contract files configured.", "");
    return;
  }

  lines.push("### API Contract Results", "");
  for (const result of apiContracts) {
    lines.push(`- **${result.schemaPath}** ${formatDifferentialStatus(result.status)}`);
    if (result.errors.length > 0) {
      lines.push(`  - Errors: ${result.errors.join("; ")}`);
    }
    for (const change of result.breakingChanges.slice(0, 8)) {
      lines.push(`  - Breaking: ${formatApiChange(change)}`);
    }
    for (const change of result.nonBreakingChanges.slice(0, 8)) {
      lines.push(`  - Non-breaking: ${formatApiChange(change)}`);
    }
    lines.push(`  - Rerun: \`${result.rerunCommand}\``);
  }
  lines.push("");
}

function formatApiChange(change: DifferentialApiContractResult["breakingChanges"][number]): string {
  const location = [
    change.method,
    change.path,
    change.statusCode ? `status ${change.statusCode}` : undefined,
    change.schemaPath ? `schema ${change.schemaPath}` : undefined
  ].filter(Boolean).join(" ");
  return location ? `${location}: ${change.message}` : change.message;
}

function formatSideExitCode(side: DifferentialSideResult): string {
  return side.exitCode === undefined ? "" : `, exit ${side.exitCode}`;
}

function formatDifferentialStatus(status: DifferentialStatus): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
