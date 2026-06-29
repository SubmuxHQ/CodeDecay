import { appendProductFailureBundleMarkdown } from "./failure-markdown";
import type { McpProductFailuresReport, McpProductPlanReport, McpProductRunReport } from "./types";

export function renderProductPlanMarkdown(plan: McpProductPlanReport): string {
  const lines = [
    "## CodeDecay MCP Product Plan",
    "",
    `**Latest report path:** \`${plan.latestReportPath}\``,
    `**Targets:** ${plan.targets.length}`,
    "",
    "### Targets",
    ""
  ];

  if (plan.targets.length === 0) {
    lines.push("- none configured");
  } else {
    for (const target of plan.targets) {
      lines.push(`- **${target.id}** ${target.readiness.status} (${target.readiness.mode})`);
      lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
      lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);
      lines.push(`  - API endpoints: ${target.apiEndpoints}`);
      lines.push(`  - Flow map: \`${target.artifacts.flowMap}\``);
      lines.push(`  - Generated UI tests: \`${target.artifacts.generatedUiTests}\``);
      lines.push(`  - Generated API tests: \`${target.artifacts.generatedApiTests}\``);
      lines.push(`  - Suggested rerun: \`${target.suggestedCommands[2]}\``);
    }
  }

  lines.push("", "### Safety", "");
  for (const note of plan.safety.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n")}\n`;
}

export function renderProductFailuresMarkdown(report: McpProductFailuresReport): string {
  const lines = [
    "## CodeDecay MCP Product Failures",
    "",
    `**Latest report path:** \`${report.reportPath}\``,
    `**Report found:** ${report.reportFound ? "yes" : "no"}`,
    `**Failures:** ${report.failures.length}`,
    ""
  ];

  if (report.error) {
    lines.push(`Error: ${report.error}`, "");
  }

  appendProductFailureBundleMarkdown(lines, report.failures);
  return `${lines.join("\n")}\n`;
}

export function renderMcpProductRunReport(report: McpProductRunReport, format: "markdown" | "json"): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay MCP Product Run",
    "",
    `**Executed:** ${report.executed ? "yes" : "no"}`,
    `**Latest report path:** \`${report.reportPath}\``,
    `**Command:** \`${report.command.join(" ")}\``,
    `**Failures:** ${report.failures.length}`,
    ""
  ];

  if (report.exitCode !== undefined) {
    lines.push(`**Exit code:** ${report.exitCode}`, "");
  }

  if (report.error) {
    lines.push(`**Error:** ${report.error}`, "");
  }

  appendProductFailureBundleMarkdown(lines, report.failures);

  lines.push("### Safety", "");
  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }

  if (!report.executed) {
    lines.push("- No product command was run because confirmExecution was not true or the CLI could not be resolved.");
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}
