import type { ProductFailureBundle } from "@submuxhq/codedecay-core";
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

function appendProductFailureBundleMarkdown(lines: string[], failures: ProductFailureBundle[]): void {
  if (failures.length === 0) {
    lines.push("No product failures found.", "");
    return;
  }

  lines.push("### Failures", "");
  for (const failure of failures) {
    lines.push(`- ${formatPriority(failure.priority)} **${failure.title}** (\`${failure.checkId}\`, ${failure.checkKind})`);
    lines.push(`  - Target: \`${failure.target.id}\`${failure.target.baseUrl ? ` at \`${failure.target.baseUrl}\`` : ""}`);
    lines.push(
      `  - Classification: ${failure.classification}${failure.classificationConfidence !== undefined ? ` (${Math.round(failure.classificationConfidence * 100)}% confidence)` : ""}`
    );
    for (const evidence of failure.classificationEvidence ?? []) {
      lines.push(`  - Evidence: ${evidence}`);
    }
    lines.push(`  - Expected: ${failure.expected}`);
    lines.push(`  - Actual: ${failure.actual}`);
    for (const task of failure.suggestedFixTasks) {
      lines.push(`  - Repair task: ${task}`);
    }
    lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
  }
  lines.push("");
}

function formatPriority(priority: ProductFailureBundle["priority"]): string {
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)}`;
}
