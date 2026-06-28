import type { ConfigFormat, LlmReviewReport } from "../types";
import { trimLongOutput } from "./output";

export function renderLlmReviewReport(report: LlmReviewReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay LLM Review",
    "",
    `**Mode:** ${report.mode}`,
    `**Provider:** ${report.provider.id}`,
    `**Model:** ${report.provider.model ? `\`${report.provider.model}\`` : "unknown"}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Setting | Value |",
    "| --- | --- |",
    `| Configured provider | ${report.provider.configuredProvider} |`,
    `| Endpoint | ${report.provider.endpoint ? `\`${report.provider.endpoint}\`` : "default"} |`,
    `| API key env | ${report.provider.apiKeyEnv ? `\`${report.provider.apiKeyEnv}\`` : "none"} |`,
    `| Timeout | ${report.provider.timeoutMs}ms |`,
    `| Structured suggestions | ${report.suggestions.length} |`,
    ""
  ];

  if (report.summary) {
    lines.push(
      "### Deterministic Context",
      "",
      "| Signal | Value |",
      "| --- | ---: |",
      `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
      `| Decay risk | ${report.summary.decayScore}/100 |`,
      `| Risk level | ${report.summary.riskLevel} |`,
      `| Changed files | ${report.summary.changedFiles} |`,
      `| Impacted areas | ${report.summary.impactedAreas} |`,
      `| Impacted routes/APIs | ${report.summary.impactedRoutes} |`,
      `| Test evidence mode | ${report.summary.evidenceMode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"} |`,
      ""
    );
  }

  lines.push("### Suggestions", "");
  if (report.suggestions.length === 0) {
    lines.push("No structured suggestions were returned.", "");
  } else {
    for (const suggestion of report.suggestions) {
      lines.push(
        `- **${suggestion.title}**${suggestion.severity ? ` (${suggestion.severity})` : ""}: ${suggestion.detail}`
      );
      if (suggestion.evidence && suggestion.evidence.length > 0) {
        lines.push(`  Evidence: ${suggestion.evidence.join("; ")}`);
      }
    }
    lines.push("");
  }

  if (report.rawText.trim()) {
    lines.push("### Raw Provider Response", "", "```text");
    for (const line of trimLongOutput(report.rawText.trim()).split(/\r?\n/)) {
      lines.push(line);
    }
    lines.push("```", "");
  }

  lines.push(
    "### Notes",
    "",
    "This command is explicit opt-in and separate from deterministic analyze, redteam, agent, and snapshot workflows.",
    "LLM suggestions are untrusted until verified by tests, configured checks, or manual review.",
    ""
  );

  return `${lines.join("\n")}\n`;
}
