import type { DoctorReport, ToolRecommendation } from "./types";

export type DoctorFormat = "json" | "markdown";

export function renderDoctorReport(report: DoctorReport, format: DoctorFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderDoctorMarkdown(report);
}

export function renderDoctorMarkdown(report: DoctorReport): string {
  const lines = [
    "## CodeDecay Doctor",
    "",
    "Local OSS tool discovery and setup recommendations.",
    "",
    "### Safety",
    "",
    "- Commands executed: no",
    "- Tools installed: no",
    "- Network used: no",
    "- LLM/model called: no",
    "- Telemetry sent: no",
    "",
    "### Detected Signals",
    ""
  ];

  if (report.signals.length === 0) {
    lines.push("No framework, test, API schema, CI, or tool signals were detected.", "");
  } else {
    lines.push("| Kind | Value | Source |", "| --- | --- | --- |");
    for (const signal of report.signals) {
      lines.push(`| ${signal.kind} | ${signal.value} | \`${signal.source}\` |`);
    }
    lines.push("");
  }

  lines.push("### Recommended OSS Tools", "");
  if (report.recommendations.length === 0) {
    lines.push("No OSS tool recommendations were generated for this repository shape.", "");
  } else {
    for (const recommendation of report.recommendations) {
      appendRecommendation(lines, recommendation);
    }
  }

  lines.push(
    "### Next Step",
    "",
    "Review recommendations, install tools yourself if useful, then opt into execution through `.codedecay/config.yml` and `safety.allowCommands: true`.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function appendRecommendation(lines: string[], recommendation: ToolRecommendation): void {
  lines.push(`- **${recommendation.tool.name}** (${recommendation.priority})`);
  lines.push(`  - Purpose: ${recommendation.tool.purpose}`);
  lines.push(`  - Why: ${recommendation.reason}`);
  lines.push(`  - Default command: \`${recommendation.tool.defaultCommand}\``);
  lines.push(`  - Evidence: ${recommendation.tool.evidence}`);
  lines.push(`  - Docs: ${recommendation.tool.docsUrl}`);
  lines.push(`  - License: ${recommendation.tool.license}`);
  lines.push(`  - Execution required: ${recommendation.tool.requiresExecution ? "yes" : "no"}`);
  lines.push(`  - May use network: ${recommendation.tool.mayUseNetwork ? "yes" : "no"}`);
  if (recommendation.tool.codeDecayAdapter) {
    lines.push(`  - CodeDecay adapter: \`${recommendation.tool.codeDecayAdapter}\``);
  }
  lines.push("");
}
