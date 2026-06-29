import type {
  CodeDecayReport,
  Finding,
  ProductFailureBundle,
  RiskLevel,
  ScoreBreakdown,
  TestEvidenceSummary
} from "@submuxhq/codedecay-core";

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

  if (report.impactedRoutes && report.impactedRoutes.length > 0) {
    lines.push("### Likely Impacted Routes And APIs", "");
    for (const route of report.impactedRoutes) {
      const methods = route.methods.length > 0 ? `${route.methods.join(", ")} ` : "";
      const label = routeLabel(route.framework, route.kind);
      lines.push(
        `- ${riskBadge(route.risk)} \`${methods}${route.route}\` (${label}): ${route.files.map((file) => `\`${file}\``).join(", ")}`
      );
    }
    lines.push("");
  }

  appendScoreBreakdown(lines, "Merge Risk Breakdown", report.summary.mergeRiskBreakdown);
  appendScoreBreakdown(lines, "Decay Risk Breakdown", report.summary.decayBreakdown);
  appendTestEvidence(lines, report.testEvidence);
  appendProductFailureBundles(lines, report.productFailureBundles);

  appendFindings(lines, "High Risk Findings", highFindings);
  appendFindings(lines, "Medium Risk Findings", mediumFindings);
  appendFindings(lines, "Low Risk Findings", lowFindings);

  if (report.recommendedTests.length > 0) {
    lines.push("### Recommended Checks", "");
    for (const test of report.recommendedTests.slice(0, 12)) {
      lines.push(`- \`${test}\``);
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

function routeLabel(framework: string, kind: string): string {
  const frameworkLabel =
    framework === "nextjs" ? "Next.js" : framework === "express" ? "Express" : framework === "fastify" ? "Fastify" : "Node";

  if (kind === "api-route") {
    return `${frameworkLabel} API route`;
  }

  if (kind === "ui-route") {
    return `${frameworkLabel} UI route`;
  }

  if (kind === "middleware") {
    return `${frameworkLabel} middleware`;
  }

  return `${frameworkLabel} route handler`;
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

function appendScoreBreakdown(lines: string[], title: string, breakdown: ScoreBreakdown | undefined): void {
  if (!breakdown) {
    return;
  }

  lines.push(`### ${title}`, "");
  lines.push(`- Score: ${breakdown.score}/100`);
  lines.push(`- Raw score before dampeners: ${breakdown.rawScore}/100`);
  lines.push(`- Adjusted score before severity cap: ${breakdown.adjustedScore}/100`);
  if (breakdown.highestSeverity) {
    lines.push(`- Highest contributing severity: ${riskBadge(breakdown.highestSeverity)}`);
  }
  if (breakdown.heuristicOnly) {
    lines.push("- Evidence mode: heuristic-only");
  }
  lines.push("");

  if (breakdown.contributors.length > 0) {
    lines.push("Top contributors:");
    for (const contributor of breakdown.contributors.slice(0, 5)) {
      lines.push(`- +${contributor.points} ${contributor.label} (${contributor.evidence}): ${contributor.reason}`);
    }
    lines.push("");
  }

  if (breakdown.dampeners.length > 0) {
    lines.push("Dampeners:");
    for (const dampener of breakdown.dampeners.slice(0, 4)) {
      lines.push(`- ${dampener.points} ${dampener.label}: ${dampener.reason}`);
    }
    lines.push("");
  }

  if (breakdown.notes.length > 0) {
    lines.push("Notes:");
    for (const note of breakdown.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }
}

function appendTestEvidence(lines: string[], testEvidence: TestEvidenceSummary | undefined): void {
  if (!testEvidence) {
    return;
  }

  lines.push("### Test Evidence", "");
  lines.push(`- Mode: ${testEvidence.mode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"}`);
  if (testEvidence.sources.length > 0) {
    lines.push(`- Sources: ${testEvidence.sources.map((source) => `\`${source.path}\` (${source.kind})`).join(", ")}`);
  } else {
    lines.push("- Sources: none");
  }

  if (testEvidence.changedSources.length > 0) {
    lines.push("- Changed source coverage:");
    for (const entry of testEvidence.changedSources.slice(0, 8)) {
      const measured =
        entry.measuredLines.length > 0
          ? `measured ${entry.measuredLines.join(", ")}`
          : "no measurable changed lines";
      lines.push(`- \`${entry.path}\`: ${entry.status.replaceAll("_", " ")} (${measured})`);
    }
  }

  if (testEvidence.notes.length > 0) {
    lines.push("- Notes:");
    for (const note of testEvidence.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
}

function appendProductFailureBundles(lines: string[], bundles: ProductFailureBundle[] | undefined): void {
  if (!bundles || bundles.length === 0) {
    return;
  }

  lines.push("### Product Failure Bundles", "");
  for (const bundle of bundles.slice(0, 8)) {
    const confidence =
      bundle.classificationConfidence === undefined ? "" : ` (${Math.round(bundle.classificationConfidence * 100)}% confidence)`;
    const files = bundle.impactedFiles.length > 0 ? bundle.impactedFiles.map((file) => `\`${file}\``).join(", ") : "none";
    lines.push(`#### ${riskBadge(bundle.priority)} ${bundle.title}`, "");
    lines.push(`- Bundle: \`${bundle.id}\``);
    lines.push(`- Check: \`${bundle.checkId}\` (${bundle.checkKind})`);
    lines.push(`- Target: \`${bundle.target.id}\`${bundle.target.baseUrl ? ` at \`${bundle.target.baseUrl}\`` : ""}`);
    lines.push(`- Classification: ${bundle.classification.replaceAll("-", " ")}${confidence}`);
    for (const evidence of bundle.classificationEvidence ?? []) {
      lines.push(`- Classification evidence: ${evidence}`);
    }
    lines.push(`- Failed step ${bundle.failedStep.index}: ${bundle.failedStep.label}`);
    lines.push(`- Expected: ${bundle.expected}`);
    lines.push(`- Actual: ${bundle.actual}`);
    lines.push(`- Impacted files: ${files}`);
    if (bundle.rootCauseHypothesis) {
      lines.push(`- Root-cause hypothesis: ${bundle.rootCauseHypothesis}`);
    }
    lines.push(`- Rerun: \`${bundle.rerunCommand}\``);

    if (bundle.artifacts.length > 0) {
      lines.push("- Artifacts:");
      for (const artifact of bundle.artifacts.slice(0, 6)) {
        const label = artifact.label ? `${artifact.label} ` : "";
        const location = artifact.path ? `\`${artifact.path}\`` : artifact.description ?? "inline artifact";
        lines.push(`- ${label}${artifact.kind}: ${location}`);
      }
    }

    if (bundle.suggestedFixTasks.length > 0) {
      lines.push("- Suggested fix tasks:");
      for (const task of bundle.suggestedFixTasks.slice(0, 5)) {
        lines.push(`- ${task}`);
      }
    }

    lines.push("");
  }
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
