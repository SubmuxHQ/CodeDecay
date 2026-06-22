import type { CodeDecayReport, Finding, RiskLevel } from "@submuxhq/codedecay-core";

export type ReportFormat = "json" | "markdown" | "sarif";

export function renderReport(report: CodeDecayReport, format: ReportFormat): string {
  if (format === "json") {
    return renderJsonReport(report);
  }

  if (format === "sarif") {
    return renderSarifReport(report);
  }

  return renderMarkdownReport(report);
}

export function renderJsonReport(report: CodeDecayReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderMarkdownReport(report: CodeDecayReport): string {
  const highFindings = report.findings.filter((finding) => finding.severity === "high");
  const mediumFindings = report.findings.filter((finding) => finding.severity === "medium");
  const lowFindings = report.findings.filter((finding) => finding.severity === "low");

  const lines: string[] = [
    "## CodeDecay Report",
    "",
    `**Overall risk:** ${riskBadge(report.summary.riskLevel)}`,
    "",
    "| Score | Value |",
    "| --- | ---: |",
    `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${report.summary.decayScore}/100 |`,
    "",
    "| Findings | Count |",
    "| --- | ---: |",
    `| High | ${report.summary.findingCounts.high} |`,
    `| Medium | ${report.summary.findingCounts.medium} |`,
    `| Low | ${report.summary.findingCounts.low} |`,
    ""
  ];

  if (report.changedFiles.length > 0) {
    lines.push("### Changed Files", "");
    for (const file of report.changedFiles.slice(0, 20)) {
      const rename = file.oldPath ? ` from \`${file.oldPath}\`` : "";
      lines.push(`- \`${file.path}\` ${file.status}${rename} (+${file.additions}/-${file.deletions})`);
    }

    if (report.changedFiles.length > 20) {
      lines.push(`- ...and ${report.changedFiles.length - 20} more file(s)`);
    }

    lines.push("");
  }

  if (report.impactedAreas.length > 0) {
    lines.push("### Likely Impacted Areas", "");
    for (const area of report.impactedAreas) {
      lines.push(`- ${riskBadge(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
    }
    lines.push("");
  }

  appendFindings(lines, "High Risk Findings", highFindings);
  appendFindings(lines, "Medium Risk Findings", mediumFindings);
  appendFindings(lines, "Low Risk Findings", lowFindings);

  if (report.recommendedTests.length > 0) {
    lines.push("### Recommended Checks", "");
    for (const test of report.recommendedTests.slice(0, 12)) {
      lines.push(`- ${test.includes("/") ? `\`${test}\`` : test}`);
    }
    lines.push("");
  }

  lines.push(
    "### Notes",
    "",
    "CodeDecay is deterministic and local-first. This report was generated without telemetry, API keys, LLMs, or model calls.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

export function renderSarifReport(report: CodeDecayReport): string {
  const rules = [...new Map(report.findings.map((finding) => [finding.ruleId, finding])).values()].map(
    (finding) => ({
      id: finding.ruleId,
      name: finding.title,
      shortDescription: {
        text: finding.title
      },
      fullDescription: {
        text: finding.description
      },
      defaultConfiguration: {
        level: sarifLevel(finding.severity)
      }
    })
  );

  const results = report.findings.map((finding) => {
    const result: Record<string, unknown> = {
      ruleId: finding.ruleId,
      level: sarifLevel(finding.severity),
      message: {
        text: `${finding.title}: ${finding.description}`
      }
    };

    if (finding.file) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: {
              uri: finding.file
            },
            region: {
              startLine: finding.line ?? 1
            }
          }
        }
      ];
    }

    return result;
  });

  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "CodeDecay",
              informationUri: "https://github.com/SubmuxHQ/codedecay",
              rules
            }
          },
          results
        }
      ]
    },
    null,
    2
  )}\n`;
}

function appendFindings(lines: string[], title: string, findings: Finding[]): void {
  if (findings.length === 0) {
    return;
  }

  lines.push(`### ${title}`, "");
  for (const finding of findings) {
    const location = finding.file ? ` (\`${finding.file}${finding.line ? `:${finding.line}` : ""}\`)` : "";
    lines.push(`- **${finding.title}**${location}: ${finding.description}`);
  }
  lines.push("");
}

function riskBadge(level: RiskLevel): string {
  if (level === "high") {
    return "High";
  }

  if (level === "medium") {
    return "Medium";
  }

  return "Low";
}

function sarifLevel(level: RiskLevel): "error" | "warning" | "note" {
  if (level === "high") {
    return "error";
  }

  if (level === "medium") {
    return "warning";
  }

  return "note";
}
