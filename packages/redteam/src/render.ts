import type {
  ImpactedArea,
  ImpactedRoute,
  ProductFailureBundle,
  RiskLevel
} from "@submuxhq/codedecay-core";
import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamFormat,
  RedteamMemorySummary,
  RedteamReport,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "./types";

export function renderRedteamReport(report: RedteamReport, format: RedteamFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderRedteamMarkdown(report);
}

export function renderRedteamMarkdown(report: RedteamReport): string {
  const lines: string[] = [
    "## CodeDecay Redteam Report",
    "",
    `**Mode:** ${report.mode}`,
    `**Overall risk:** ${formatRisk(report.summary.riskLevel)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${report.summary.decayScore}/100 |`,
    `| Changed files | ${report.summary.changedFiles} |`,
    `| Impacted areas | ${report.summary.impactedAreas} |`,
    `| Impacted routes/APIs | ${report.summary.impactedRoutes} |`,
    `| Missing-test findings | ${report.summary.missingTestFindings} |`,
    `| Weak-test findings | ${report.summary.weakTestFindings} |`,
    `| Edge cases suggested | ${report.summary.edgeCases} |`,
    `| Configured checks listed | ${report.summary.configuredChecks} |`,
    `| Tool adapters planned | ${report.summary.toolAdapters} |`,
    `| Product failure bundles | ${report.summary.productFailureBundles} |`,
    ""
  ];

  appendImpactedAreas(lines, report.analysis.impactedAreas);
  appendImpactedRoutes(lines, report.analysis.impactedRoutes ?? []);
  appendTestAudit(lines, report.testAudit);
  appendProductFailures(lines, report.analysis.productFailureBundles ?? []);
  appendEdgeCases(lines, report.edgeCases);
  appendConfiguredChecks(lines, report.configuredChecks);
  appendToolAdapterPlans(lines, report.toolAdapterPlans);
  appendFixTasks(lines, report.fixTasks);
  appendMemorySummary(lines, report.memory);
  appendSkills(lines, report.skills);

  lines.push(
    "### Safety",
    "",
    "- Commands executed: no",
    "- LLM/model called: no",
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    "",
    "CodeDecay separates deterministic tool evidence from AI suggestions. This command produces local evidence and fix tasks that your own agent can use.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function appendImpactedAreas(lines: string[], areas: ImpactedArea[]): void {
  if (areas.length === 0) {
    lines.push("### What Could Break", "", "No impacted product/system areas were detected.", "");
    return;
  }

  lines.push("### What Could Break", "");
  for (const area of areas.slice(0, 12)) {
    lines.push(`- ${formatRisk(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push("");
}

function appendImpactedRoutes(lines: string[], routes: ImpactedRoute[]): void {
  lines.push("### Likely Impacted Routes And APIs", "");
  if (routes.length === 0) {
    lines.push("No concrete route/API impacts were detected.", "");
    return;
  }

  for (const route of routes.slice(0, 12)) {
    const files = route.files.map((file) => `\`${file}\``).join(", ");
    lines.push(`- ${formatRisk(route.risk)} \`${formatRoute(route)}\` (${routeKindLabel(route)}): ${files}`);

    for (const reason of route.reasons.slice(0, 2)) {
      lines.push(`  - ${reason}`);
    }

    if (route.recommendedTests.length > 0) {
      lines.push(`  - Suggested evidence: ${route.recommendedTests[0]}`);
    }
  }
  lines.push("");
}

function appendTestAudit(lines: string[], audit: TestProofAudit): void {
  lines.push("### Test Evidence Audit", "");
  lines.push(`**Status:** ${formatTestProofStatus(audit.status)}`);
  lines.push(`**Summary:** ${audit.summary}`, "");
  lines.push(`**Evidence mode:** ${audit.evidenceMode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"}`);
  lines.push(`**Evidence summary:** ${audit.evidenceSummary}`, "");
  lines.push("| Signal | Count |", "| --- | ---: |");
  lines.push(`| Changed source files | ${audit.changedSourceFiles.length} |`);
  lines.push(`| Changed test files | ${audit.changedTestFiles.length} |`);
  lines.push(`| Missing-test findings | ${audit.missingTestFindings.length} |`);
  lines.push(`| Weak-test findings | ${audit.weakTestFindings.length} |`, "");

  if (audit.missingTestFindings.length === 0 && audit.weakTestFindings.length === 0) {
    lines.push("No missing-test or weak-test findings were detected by deterministic rules or runtime coverage inputs.", "");
  }

  for (const finding of [...audit.missingTestFindings, ...audit.weakTestFindings].slice(0, 10)) {
    const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
    lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
  }

  if (audit.recommendedChecks.length > 0) {
    lines.push("", "Recommended stronger checks:");
    for (const check of audit.recommendedChecks.slice(0, 8)) {
      lines.push(`- ${check}`);
    }
  }

  lines.push("");
}

function appendProductFailures(lines: string[], bundles: ProductFailureBundle[]): void {
  if (bundles.length === 0) {
    return;
  }

  lines.push("### Product Verification Failures", "");
  for (const bundle of bundles.slice(0, 8)) {
    const files = bundle.impactedFiles.length > 0 ? bundle.impactedFiles.map((file) => `\`${file}\``).join(", ") : "none";
    lines.push(`- ${formatRisk(bundle.priority)} **${bundle.title}** (\`${bundle.checkId}\`, ${bundle.checkKind})`);
    lines.push(`  - Target: \`${bundle.target.id}\`${bundle.target.baseUrl ? ` at \`${bundle.target.baseUrl}\`` : ""}`);
    lines.push(`  - Classification: ${bundle.classification.replaceAll("-", " ")}`);
    lines.push(`  - Failed step ${bundle.failedStep.index}: ${bundle.failedStep.label}`);
    lines.push(`  - Expected: ${bundle.expected}`);
    lines.push(`  - Actual: ${bundle.actual}`);
    lines.push(`  - Impacted files: ${files}`);
    lines.push(`  - Rerun: \`${bundle.rerunCommand}\``);
  }
  lines.push("");
}

function appendEdgeCases(lines: string[], edgeCases: string[]): void {
  lines.push("### Missing Edge Cases To Check", "");
  for (const edgeCase of edgeCases.slice(0, 12)) {
    lines.push(`- ${edgeCase}`);
  }
  lines.push("");
}

function appendConfiguredChecks(lines: string[], checks: RedteamConfiguredCheck[]): void {
  lines.push("### Configured Checks Available", "");
  if (checks.length === 0) {
    lines.push("No test/build/start/probe commands are configured.", "");
    return;
  }

  for (const check of checks.slice(0, 12)) {
    lines.push(`- **${check.name}** (${check.kind}, not run): \`${check.command}\``);
  }
  lines.push("");
}

function appendToolAdapterPlans(lines: string[], plans: RedteamToolAdapterPlan[]): void {
  lines.push("### Tool Adapter Plans", "");
  if (plans.length === 0) {
    lines.push("No Playwright, coverage, StrykerJS, Semgrep, Schemathesis, or Pact tool adapters are configured.", "");
    return;
  }

  for (const plan of plans.slice(0, 12)) {
    const approval = plan.requiresApproval ? "requires command approval" : "command approval configured";
    lines.push(`- **${plan.name}** (${plan.kind}, not run, ${approval}): \`${plan.command}\``);
  }
  lines.push("");
}

function appendFixTasks(lines: string[], tasks: RedteamFixTask[]): void {
  lines.push("### Tasks For Your Coding Agent", "");
  if (tasks.length === 0) {
    lines.push("No fix tasks were generated.", "");
    return;
  }

  for (const task of tasks.slice(0, 12)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(`- ${formatRisk(task.priority)} **${task.title}**${location}: ${task.detail}`);
  }
  lines.push("");
}

function appendMemorySummary(lines: string[], memory: RedteamMemorySummary): void {
  lines.push("### Memory Context", "");
  lines.push(`**Source:** ${memory.sourcePath ? `\`${memory.sourcePath}\`` : "defaults (no memory file found)"}`, "");
  lines.push("| Section | Count |", "| --- | ---: |");
  lines.push(`| Flows | ${memory.flows} |`);
  lines.push(`| Commands | ${memory.commands} |`);
  lines.push(`| Invariants | ${memory.invariants} |`);
  lines.push(`| Architecture notes | ${memory.architecture} |`);
  lines.push(`| Past regressions | ${memory.regressions} |`, "");
}

function appendSkills(lines: string[], skills: RedteamSkillSummary[]): void {
  lines.push("### Agent Skills", "");
  if (skills.length === 0) {
    lines.push("No repo-local agent skills found under `.agents/skills`.", "");
    return;
  }

  for (const skill of skills.slice(0, 8)) {
    lines.push(`- **${skill.title}** (\`${skill.path}\`): ${skill.summary}`);
  }
  lines.push("", "Skill content is local context for your own agent. CodeDecay does not execute it.", "");
}

function formatRisk(level: RiskLevel): string {
  if (level === "high") {
    return "High";
  }

  if (level === "medium") {
    return "Medium";
  }

  return "Low";
}

function formatRoute(route: ImpactedRoute): string {
  if (route.methods.length === 0) {
    return route.route;
  }

  return `${route.methods.join(", ")} ${route.route}`;
}

function routeKindLabel(route: ImpactedRoute): string {
  if (route.framework === "nextjs" && route.kind === "api-route") {
    return "Next.js API route";
  }

  if (route.framework === "nextjs" && route.kind === "ui-route") {
    return "Next.js UI route";
  }

  if (route.framework === "nextjs" && route.kind === "middleware") {
    return "Next.js middleware";
  }

  if (route.framework === "express") {
    return "Express route handler";
  }

  if (route.framework === "fastify") {
    return "Fastify route handler";
  }

  return "Node route handler";
}

function formatTestProofStatus(status: TestProofAudit["status"]): string {
  if (status === "not_applicable") {
    return "Not applicable";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
