import type { BenchmarkFormat } from "../types";
import type { BenchmarkReport } from "./run";

export function renderBenchmarkReport(report: BenchmarkReport, format: BenchmarkFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderBenchmarkMarkdown(report);
}

function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [
    "## CodeDecay Benchmark",
    "",
    `Corpus: \`${report.corpus}\``,
    "",
    "| Summary | Value |",
    "| --- | ---: |",
    `| Expected catches | ${report.summary.totalExpected} |`,
    `| Matched catches | ${report.summary.totalMatched} |`,
    `| Overall recall | ${formatPercent(report.summary.overallRecall)} |`,
    `| False-positive rate | ${formatPercent(report.summary.falsePositiveRate)} |`,
    `| False positives | ${report.summary.falsePositives} |`,
    `| Duration | ${report.summary.durationMs} ms |`,
    `| Cost | $${report.summary.costUsd.toFixed(2)} |`,
    `| LLM/model called | ${report.summary.llmCalled ? "yes" : "no"} |`,
    `| Telemetry sent | ${report.summary.telemetrySent ? "yes" : "no"} |`,
    "",
    "### By Area",
    "",
    "| Area | Expected | Matched | Recall | False positives | Precision |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const area of report.metrics.byArea) {
    lines.push(
      `| ${area.area} | ${area.expected} | ${area.matched} | ${formatPercent(area.recall)} | ${area.falsePositives} | ${formatPercent(area.precision)} |`
    );
  }

  lines.push(
    "",
    "### By Rule",
    "",
    "| Rule | Area | Expected | Matched | Recall | False positives | Precision |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |"
  );

  for (const rule of report.metrics.byRuleId) {
    lines.push(
      `| \`${rule.ruleId}\` | ${rule.area} | ${rule.expected} | ${rule.matched} | ${formatPercent(rule.recall)} | ${rule.falsePositives} | ${formatPercent(rule.precision)} |`
    );
  }

  lines.push(
    "",
    "### Safety",
    "",
    "- Runs locally against generated or user-supplied git repos.",
    "- Commands executed: no project commands; only deterministic CodeDecay analysis.",
    "- LLM/model called: no",
    "- Telemetry sent: no",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10000) / 100}%`;
}
