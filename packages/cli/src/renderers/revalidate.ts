import type { RevalidateCliReport } from "../types";

export function renderRevalidationReport(report: RevalidateCliReport, format: "json" | "markdown"): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay Revalidation",
    "",
    "| Status | Count |",
    "| --- | ---: |",
    `| Fixed | ${report.summary.fixed} |`,
    `| Confirmed | ${report.summary.confirmed} |`,
    `| Accepted risk | ${report.summary["accepted-risk"]} |`,
    `| False positive | ${report.summary["false-positive"]} |`,
    `| Uncertain | ${report.summary.uncertain} |`,
    `| Total | ${report.summary.total} |`,
    "",
    "### Findings Lifecycle",
    ""
  ];

  if (report.items.length === 0) {
    lines.push("No previous findings or security candidates were present in the input report.", "");
  } else {
    for (const item of report.items) {
      const location = item.file ? ` (${item.file}${item.line ? `:${item.line}` : ""})` : "";
      lines.push(`- **${formatStatus(item.status)}** \`${item.id}\`: ${item.title}${location}`);
      for (const evidence of item.evidence) {
        lines.push(`  - ${evidence}`);
      }
    }
    lines.push("");
  }

  lines.push(
    "### Memory Preview",
    "",
    `Mode: ${report.memoryPreview.apply ? "applied" : "preview only"}`,
    "",
    "| Section | Suggested | Added | Merged |",
    "| --- | ---: | ---: | ---: |",
    `| Past regressions | ${report.memoryPreview.suggested.regressions} | ${report.memoryPreview.added.regressions} | ${report.memoryPreview.merged.regressions} |`,
    ""
  );

  if (report.memoryPreview.writtenPath) {
    lines.push(`Written: \`${report.memoryPreview.writtenPath}\``, "");
  } else {
    lines.push("Run with `--apply-memory` to write the previewed memory changes.", "");
  }

  lines.push(
    "### Safety",
    "",
    "- Deterministic: yes",
    "- LLM/model called: no",
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function formatStatus(status: string): string {
  return status
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
