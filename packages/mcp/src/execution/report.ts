import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import type { Evidence } from "@submuxhq/codedecay-harness";
import type {
  McpExecutionReport,
  McpExecutionResult,
  McpExecutionSafety,
  McpExecutionSummary,
  McpExecutionToolAdapterResult
} from "./types";

export function createBaseExecutionReport(input: {
  loadedConfig: LoadedCodeDecayConfig;
  executed: boolean;
  safety: McpExecutionSafety;
  summary: McpExecutionSummary;
  results: McpExecutionResult[];
  toolAdapters: McpExecutionToolAdapterResult[];
}): McpExecutionReport {
  const report: McpExecutionReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    mode: "mcp-execute",
    generatedAt: new Date().toISOString(),
    executed: input.executed,
    summary: input.summary,
    results: input.results,
    toolAdapters: input.toolAdapters,
    safety: input.safety
  };

  if (input.loadedConfig.sourcePath) {
    report.configSource = input.loadedConfig.sourcePath;
  }

  return report;
}

export function createExecutionSummary(
  results: McpExecutionResult[],
  toolAdapters: McpExecutionToolAdapterResult[],
  durationMs: number
): McpExecutionSummary {
  const allResults = [...results, ...toolAdapters];
  const passed = countStatus(allResults, "passed");
  const failed = countStatus(allResults, "failed");
  const skipped = countStatus(allResults, "skipped");
  const timedOut = countStatus(allResults, "timed_out");
  const errors = countStatus(allResults, "error");

  return {
    status: executionStatus(allResults, { failed, timedOut, errors }),
    total: allResults.length,
    passed,
    failed,
    skipped,
    timedOut,
    errors,
    durationMs
  };
}

export function renderMcpExecutionReport(report: McpExecutionReport, format: "markdown" | "json"): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderMcpExecutionMarkdown(report);
}

export function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

function executionStatus(
  results: Array<{ status: AdapterStatus }>,
  counts: Pick<McpExecutionSummary, "failed" | "timedOut" | "errors">
): AdapterStatus {
  if (counts.errors > 0) {
    return "error";
  }

  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function renderMcpExecutionMarkdown(report: McpExecutionReport): string {
  const lines = [
    "## CodeDecay MCP Execution Report",
    "",
    `**Executed:** ${report.executed ? "yes" : "no"}`,
    `**Overall status:** ${formatExecutionStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    `**Command execution allowed:** ${report.safety.allowCommands ? "yes" : "no"}`,
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

  if (!report.executed) {
    lines.push("No commands were executed. Pass `confirmExecution: true` to run configured local checks.", "");
  }

  if (report.results.length > 0) {
    lines.push("### Configured Command Results", "");
    for (const result of report.results) {
      lines.push(
        `- **${result.name}** (${result.kind}) ${formatExecutionStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
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
        `- **${result.name}** (${result.kind}) ${formatExecutionStatus(result.status)} in ${result.durationMs}ms: \`${result.command}\``
      );

      if (result.failure) {
        lines.push(`  - Failure: ${result.failure.mode}: ${result.failure.message}`);
      }

      appendToolEvidence(lines, result.evidence);
    }
    lines.push("");
  }

  if (report.results.length === 0 && report.toolAdapters.length === 0 && report.executed) {
    lines.push("No configured commands, probes, or tool adapters found.", "");
  }

  lines.push("### Safety", "");
  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

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

function appendOutputBlock(lines: string[], label: string, output: string): void {
  const trimmed = output.trim();
  if (!trimmed) {
    return;
  }

  lines.push(`  - ${label}:`);
  lines.push("    ```text");
  for (const line of trimLongOutput(trimmed).split(/\r?\n/)) {
    lines.push(`    ${line}`);
  }
  lines.push("    ```");
}

function trimLongOutput(output: string): string {
  const limit = 2000;
  if (output.length <= limit) {
    return output;
  }

  return `${output.slice(output.length - limit)}\n[output truncated to last ${limit} characters]`;
}

function countStatus(results: Array<{ status: AdapterStatus }>, status: AdapterStatus): number {
  return results.filter((result) => result.status === status).length;
}

function formatExecutionStatus(status: AdapterStatus | "not_confirmed"): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  if (status === "not_confirmed") {
    return "Not confirmed";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatEvidenceSeverity(severity: Evidence["severity"]): string {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}
