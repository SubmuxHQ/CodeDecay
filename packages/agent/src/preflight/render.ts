import { formatRisk } from "../formatting";
import type {
  AgentPreflightCandidateRoute,
  AgentPreflightFormat,
  AgentPreflightMemoryEvidence,
  AgentPreflightReport
} from "./types";

export function renderAgentPreflightReport(report: AgentPreflightReport, format: AgentPreflightFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderAgentPreflightMarkdown(report);
}

export function renderAgentPreflightMarkdown(report: AgentPreflightReport): string {
  const lines = [
    "## CodeDecay Agent Preflight",
    "",
    "Use this before code generation to give a user-owned coding agent repo-grounded constraints and proof expectations.",
    "",
    `**Task:** ${report.task}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Confidence | ${report.summary.confidence} |`,
    `| Likely areas | ${report.summary.likelyAreas} |`,
    `| Candidate files | ${report.summary.candidateFiles} |`,
    `| Candidate routes/APIs | ${report.summary.candidateRoutes} |`,
    `| Memory matches | ${report.summary.memoryMatches} |`,
    `| Design constraints | ${report.summary.designConstraints} |`,
    `| Configured checks listed | ${report.summary.configuredChecks} |`,
    `| Acceptance criteria | ${report.summary.acceptanceCriteria} |`,
    `| Unresolved questions | ${report.summary.unresolvedQuestions} |`,
    `| Insufficient repo context | ${report.summary.insufficientContext ? "yes" : "no"} |`,
    "",
    "### Requirement Evidence",
    "",
    `Requirement confidence: ${report.requirements.confidence}`,
    "",
    "Provenance:"
  ];

  appendList(
    lines,
    report.requirements.sources.map((source) => {
      const location = source.location ? ` at \`${source.location}\`` : "";
      return `\`${source.id}\` (${source.kind}): ${source.label}${location}`;
    })
  );
  lines.push("", "Acceptance criteria:");
  appendList(
    lines,
    report.requirements.acceptanceCriteria.map((criterion) => {
      const proof = criterion.requiredProof.length > 0
        ? ` Required proof: ${criterion.requiredProof.join(" ")}`
        : "";
      return `${criterion.id}: ${criterion.text} [sources: ${criterion.sourceIds.join(", ")}].${proof}`;
    })
  );
  lines.push("", "Affected flows:");
  appendList(
    lines,
    report.requirements.affectedFlows.map(
      (flow) => `${flow.kind}: ${flow.name} [sources: ${flow.sourceIds.join(", ")}]`
    )
  );
  lines.push("", "Unresolved questions:");
  appendList(
    lines,
    report.requirements.unresolvedQuestions.map(
      (question) => `${question.text} [sources: ${question.sourceIds.join(", ")}]`
    )
  );
  lines.push(
    "",
    "### Deterministic Repo Evidence",
    "",
    `No git diff required: ${report.deterministicEvidence.taskSignals.noDiffRequired ? "yes" : "no"}`,
    "",
    "Task signals:"
  );

  appendList(lines, report.deterministicEvidence.taskSignals.tokens.map((token) => `\`${token}\``), "- none");
  lines.push("", "Matched task keywords:");
  appendList(
    lines,
    report.deterministicEvidence.taskSignals.matchedKeywords.map(
      (match) => `${match.area}: ${match.keywords.map((keyword) => `\`${keyword}\``).join(", ")}`
    ),
    "- none"
  );

  lines.push("", "Likely impacted areas:");
  appendList(
    lines,
    report.deterministicEvidence.likelyAreas.map(
      (area) => `${area.confidence} ${area.kind}: ${area.name} (${area.reasons.join(" ")})`
    ),
    "- none"
  );

  lines.push("", "Candidate files:");
  appendList(
    lines,
    report.deterministicEvidence.candidateFiles.map(
      (file) => `\`${file.path}\` (${file.areas.join(", ")}): ${file.reasons.join(" ")}`
    ),
    "- none"
  );

  lines.push("", "Candidate routes and APIs:");
  appendList(
    lines,
    report.deterministicEvidence.candidateRoutes.map(
      (route) => `${formatCandidateRoute(route)} (${route.kind}): ${route.reasons.join(" ")}`
    ),
    "- none"
  );

  appendMemory(lines, report.deterministicEvidence.memory);
  appendDesignConstraints(lines, report);
  appendConfiguredChecks(lines, report);
  appendInvestigation(lines, report);

  lines.push("", "### Suggestions For Agent", "", "Implementation brief:");
  appendList(lines, report.suggestions.implementationBrief);
  lines.push("", "Proof plan:");
  appendList(lines, report.suggestions.proofPlan);
  lines.push("", "Agent instructions:");
  appendList(lines, report.suggestions.agentInstructions);
  lines.push("", "Non-goals:");
  appendList(lines, report.suggestions.nonGoals);
  lines.push("", "Safety constraints:");
  appendList(lines, report.suggestions.safetyConstraints);

  lines.push(
    "",
    "### Safety And Limits",
    "",
    `LLM/model called by CodeDecay: ${report.safety.llmCalled ? "yes" : "no"}`,
    "",
    `Commands executed by CodeDecay: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    "",
    `Telemetry sent: ${report.safety.telemetrySent ? "yes" : "no"}`,
    "",
    `Cloud dependency required: ${report.safety.cloudDependency ? "yes" : "no"}`,
    "",
    "Limits:"
  );
  appendList(lines, report.limits);

  return `${lines.join("\n")}\n`;
}

function appendInvestigation(lines: string[], report: AgentPreflightReport): void {
  if (!report.investigation) {
    return;
  }
  lines.push("", "### Untrusted Agent Investigation", "", `Status: ${report.investigation.status}`, "");
  appendList(
    lines,
    report.investigation.suggestions.map((suggestion) => `${suggestion.title}: ${suggestion.detail}`)
  );
}

function appendMemory(lines: string[], memory: AgentPreflightMemoryEvidence): void {
  lines.push("", "Memory matches:");
  appendMemorySection(lines, "Flows", memory.flows);
  appendMemorySection(lines, "Commands", memory.commands.map((entry) => ({
    ...entry,
    description: entry.description ? `${entry.description} Command: \`${entry.command}\`.` : `Command: \`${entry.command}\`.`
  })));
  appendMemorySection(lines, "Invariants", memory.invariants.map((entry) => ({
    ...entry,
    description: `${entry.severity ? `${formatRisk(entry.severity)}. ` : ""}${entry.description ?? ""}`.trim()
  })));
  appendMemorySection(lines, "Architecture", memory.architecture);
  appendMemorySection(lines, "Regressions", memory.regressions.map((entry) => ({
    ...entry,
    description: `${entry.severity ? `${formatRisk(entry.severity)}. ` : ""}${entry.description ?? ""}`.trim()
  })));
}

function appendMemorySection(
  lines: string[],
  title: string,
  entries: { title: string; description?: string | undefined; matchReasons: string[] }[]
): void {
  lines.push(`- ${title}:`);
  if (entries.length === 0) {
    lines.push("  - none");
    return;
  }

  for (const entry of entries) {
    const description = entry.description ? ` - ${entry.description}` : "";
    lines.push(`  - **${entry.title}**${description}`);
    for (const reason of entry.matchReasons.slice(0, 2)) {
      lines.push(`    - ${reason}`);
    }
  }
}

function appendDesignConstraints(lines: string[], report: AgentPreflightReport): void {
  lines.push("", "Design constraints:");
  if (report.deterministicEvidence.designConstraints.length === 0) {
    lines.push("- none matched");
    return;
  }

  for (const constraint of report.deterministicEvidence.designConstraints) {
    const severity = constraint.severity ? `${formatRisk(constraint.severity)} ` : "";
    const label = constraint.name ? `${constraint.name} (\`${constraint.id}\`)` : `\`${constraint.id}\``;
    lines.push(`- ${severity}${constraint.kind}: ${label}`);
    if (constraint.message) {
      lines.push(`  - ${constraint.message}`);
    }
    if (constraint.allowedFiles?.length) {
      lines.push(`  - Allowed files: ${constraint.allowedFiles.map((file) => `\`${file}\``).join(", ")}`);
    }
    if (constraint.allowedAreas?.length) {
      lines.push(`  - Allowed areas: ${constraint.allowedAreas.join(", ")}`);
    }
    if (constraint.rewrite) {
      lines.push(`  - Rewrite guidance: ${constraint.rewrite}`);
    }
    lines.push(`  - Match reason: ${constraint.reason}`);
  }
}

function appendConfiguredChecks(lines: string[], report: AgentPreflightReport): void {
  lines.push("", "Configured checks listed, not run:");
  if (report.deterministicEvidence.configuredChecks.length === 0) {
    lines.push("- none");
    return;
  }

  for (const check of report.deterministicEvidence.configuredChecks.slice(0, 12)) {
    lines.push(`- ${check.source} ${check.kind}: \`${check.command}\` (willRun=${String(check.willRun)})`);
  }
}

function appendList(lines: string[], entries: string[], empty = "- none"): void {
  if (entries.length === 0) {
    lines.push(empty);
    return;
  }

  for (const entry of entries) {
    lines.push(`- ${entry}`);
  }
}

function formatCandidateRoute(route: AgentPreflightCandidateRoute): string {
  const methods = route.methods.length > 0 ? `${route.methods.join(", ")} ` : "";
  return `\`${methods}${route.route}\``;
}
