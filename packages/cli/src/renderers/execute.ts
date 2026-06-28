import type { Evidence } from "@submuxhq/codedecay-harness";
import type { ConfigFormat, ExecutionReport } from "../types";
import { appendOutputBlock, formatStatus } from "./command-output";

export function renderExecutionReport(report: ExecutionReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderExecutionMarkdown(report);
}

function renderExecutionMarkdown(report: ExecutionReport): string {
  const lines = [
    "## CodeDecay Execution Report",
    "",
    `**Overall status:** ${formatStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Errors | ${report.summary.errors} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.results.length === 0 && report.toolAdapters.length === 0) {
    lines.push("No configured commands, probes, or tool adapters found.", "");
    return `${lines.join("\n")}\n`;
  }

  if (report.results.length > 0) {
    lines.push("### Results", "");
    for (const result of report.results) {
      lines.push(
        `- **${result.name}** (${result.kind}) ${formatStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
      );

      if (result.exitCode !== undefined) {
        lines.push(`  - Exit code: ${result.exitCode}`);
      }

      if (result.error) {
        lines.push(`  - Error: ${result.error}`);
      }

      appendOutputBlock(lines, "stdout", result.stdout);
      appendOutputBlock(lines, "stderr", result.stderr);
    }
    lines.push("");
  }

  if (report.toolAdapters.length > 0) {
    lines.push("### Tool Adapter Results", "");
    for (const result of report.toolAdapters) {
      lines.push(
        `- **${result.name}** (${result.kind}) ${formatStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
      );

      if (result.failure) {
        lines.push(`  - Failure: ${result.failure.mode}: ${result.failure.message}`);
      }

      appendToolEvidence(lines, result.evidence);
    }
    lines.push("");
  }

  lines.push(
    "",
    "### Notes",
    "",
    "CodeDecay only runs commands explicitly configured in CodeDecay config. It does not run commands proposed by LLMs or remote services.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function appendToolEvidence(lines: string[], evidence: Evidence[]): void {
  if (evidence.length === 0) {
    return;
  }

  lines.push("  - Evidence:");
  for (const item of evidence.slice(0, 5)) {
    lines.push(`    - ${formatEvidenceSeverity(item.severity)} ${item.kind}: ${item.summary}`);
  }
}

function formatEvidenceSeverity(severity: Evidence["severity"]): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}
