import type { RedteamFixTask, RedteamSkillSummary } from "@submuxhq/codedecay-redteam";
import { formatRisk, formatRoute, routeKindLabel } from "../../formatting";
import type {
  AgentEvidence,
  AgentFindingEvidence,
  AgentSuggestedCheck,
  AgentSymbolImpact,
  AgentTestProofEntry,
  AgentTaskBundle
} from "../../types";
import type { AgentProfile } from "../../profiles";
import { appendList } from "./list";

export function appendHandoff(lines: string[], profile: AgentProfile): void {
  lines.push("", "### Agent Handoff", "", `**Profile:** ${profile.name}`, "", profile.description, "");
  appendList(lines, profile.handoff);
}

export function appendPrompt(lines: string[], prompt: string): void {
  lines.push("", "### Copy-Paste Prompt", "", "```text", prompt, "```");
}

export function appendEvidence(lines: string[], evidence: AgentEvidence): void {
  lines.push("", "### Tool Evidence", "");

  appendChangedFileEvidence(lines, evidence);
  appendAreaEvidence(lines, evidence);
  appendRouteEvidence(lines, evidence);
  appendSymbolImpactEvidence(lines, evidence.symbolImpacts);
  appendTestProofEvidence(lines, evidence.testProofEntries);
  appendFindingEvidence(lines, "Weak or missing test proof:", [
    ...evidence.missingTestFindings,
    ...evidence.weakTestFindings
  ], "- no deterministic weak-test findings");
  appendFindingEvidence(lines, "Scope and contract evidence:", [
    ...evidence.scopeFindings,
    ...evidence.contractFindings
  ], "- no deterministic scope or contract findings");

  lines.push("", "Edge cases to check:");
  appendList(lines, evidence.edgeCases);

  appendProductFailureEvidence(lines, evidence);
}

function appendChangedFileEvidence(lines: string[], evidence: AgentEvidence): void {
  lines.push("Changed files:");
  appendList(lines, evidence.changedFiles.map((file) => `${file.status}: \`${file.path}\``));
}

function appendAreaEvidence(lines: string[], evidence: AgentEvidence): void {
  lines.push("", "Impacted areas:");
  if (evidence.impactedAreas.length === 0) {
    lines.push("- none detected");
    return;
  }

  for (const area of evidence.impactedAreas.slice(0, 12)) {
    lines.push(`- ${formatRisk(area.risk)} **${area.name}** (${area.kind}): ${formatFiles(area.files)}`);
  }
}

function appendRouteEvidence(lines: string[], evidence: AgentEvidence): void {
  lines.push("", "Impacted routes and APIs:");
  if (evidence.impactedRoutes.length === 0) {
    lines.push("- none detected");
    return;
  }

  for (const route of evidence.impactedRoutes.slice(0, 12)) {
    lines.push(`- ${formatRisk(route.risk)} \`${formatRoute(route)}\` (${routeKindLabel(route)}): ${formatFiles(route.files)}`);

    for (const reason of route.reasons.slice(0, 2)) {
      lines.push(`  - ${reason}`);
    }

    if (route.recommendedTests.length > 0) {
      lines.push(`  - Suggested proof: ${route.recommendedTests[0]}`);
    }
  }
}

function appendSymbolImpactEvidence(lines: string[], impacts: AgentSymbolImpact[]): void {
  lines.push("", "Symbol impact evidence:");
  if (impacts.length === 0) {
    lines.push("- none detected");
    return;
  }

  for (const impact of impacts.slice(0, 12)) {
    const importers = impact.importerFiles.length > 0 ? formatFiles(impact.importerFiles) : "no direct importers found";
    lines.push(`- \`${impact.file}#${impact.symbol}\` -> ${importers}`);
    if (impact.routeFiles.length > 0) {
      lines.push(`  - Route/API files: ${formatFiles(impact.routeFiles)}`);
    }
    if (impact.likelyTests.length > 0) {
      lines.push(`  - Likely tests: ${formatFiles(impact.likelyTests)}`);
    }
  }
}

function appendTestProofEvidence(lines: string[], entries: AgentTestProofEntry[]): void {
  lines.push("", "Changed path test proof:");
  if (entries.length === 0) {
    lines.push("- none detected");
    return;
  }

  for (const entry of entries.slice(0, 12)) {
    const target = entry.symbol ? `${entry.file}#${entry.symbol}` : entry.file;
    lines.push(`- ${formatProofStatus(entry.status)} \`${target}\` (${entry.evidence}, ${entry.proof})`);
    for (const reason of entry.reasons.slice(0, 2)) {
      lines.push(`  - Evidence: ${reason}`);
    }
    if (entry.staticReferences.length > 0) {
      lines.push(`  - Static references: ${formatFiles(entry.staticReferences)}`);
    }
    if (entry.weakenedByMocks.length > 0) {
      lines.push(`  - Mocked in: ${formatFiles(entry.weakenedByMocks)}`);
    }
    lines.push(`  - Repair task: ${entry.repairTask}`);
  }
}

function appendFindingEvidence(
  lines: string[],
  title: string,
  findings: AgentFindingEvidence[],
  emptyMessage: string
): void {
  lines.push("", title);
  if (findings.length === 0) {
    lines.push(emptyMessage);
    return;
  }

  for (const finding of findings.slice(0, 12)) {
    const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
    lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
  }
}

function appendProductFailureEvidence(lines: string[], evidence: AgentEvidence): void {
  lines.push("", "Product failure bundles:");
  if (evidence.productFailureBundles.length === 0) {
    lines.push("- none");
    return;
  }

  for (const bundle of evidence.productFailureBundles.slice(0, 8)) {
    const files = bundle.impactedFiles.length > 0 ? formatFiles(bundle.impactedFiles) : "none";
    lines.push(`- ${formatRisk(bundle.priority)} **${bundle.title}** (\`${bundle.checkId}\`, ${bundle.checkKind})`);
    lines.push(`  - Target: \`${bundle.target.id}\`${bundle.target.baseUrl ? ` at \`${bundle.target.baseUrl}\`` : ""}`);
    lines.push(`  - Failed step ${bundle.failedStep.index}: ${bundle.failedStep.label}`);
    lines.push(`  - Classification: ${bundle.classification.replaceAll("-", " ")}`);
    for (const item of bundle.classificationEvidence ?? []) {
      lines.push(`  - Evidence: ${item}`);
    }
    lines.push(`  - Impacted files: ${files}`);
    for (const task of bundle.suggestedFixTasks.slice(0, 3)) {
      lines.push(`  - Repair task: ${task}`);
    }
    lines.push(`  - Rerun: \`${bundle.rerunCommand}\``);
  }
}

function formatFiles(files: string[]): string {
  return files.map((file) => `\`${file}\``).join(", ");
}

function formatProofStatus(status: AgentTestProofEntry["status"]): string {
  switch (status) {
    case "proven_by_runtime_coverage":
      return "Runtime-proven";
    case "referenced_only_statically":
      return "Static-only";
    case "weakened_by_mocking":
      return "Weakened by mocks";
    case "unproven":
      return "Unproven";
  }
}

export function appendTasks(lines: string[], tasks: RedteamFixTask[]): void {
  lines.push("", "### Tasks To Complete", "");
  if (tasks.length === 0) {
    lines.push("- no fix tasks generated");
    return;
  }

  for (const task of tasks.slice(0, 20)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(`- ${formatRisk(task.priority)} **${task.title}**${location} [${formatProofGrade(task.proof)}]: ${task.detail}`);
    if (task.scope) {
      const files = task.scope.files.slice(0, 4).map((file) => `\`${file}\``).join(", ");
      const areas = task.scope.areas.join(", ");
      lines.push(`  - Scope: ${areas || "unknown area"}${files ? ` in ${files}` : ""}`);
    }
  }
}

function formatProofGrade(grade: RedteamFixTask["proof"]): string {
  switch (grade) {
    case "tool-evidence":
      return "tool evidence";
    case "deterministic-signal":
      return "deterministic signal";
    case "missing-proof":
      return "missing proof";
    case "memory-context":
      return "memory context";
    case "agent-suggestion":
      return "agent suggestion";
  }
}

export function appendChecks(lines: string[], checks: AgentSuggestedCheck[]): void {
  lines.push("", "### Suggested Local Checks", "");
  if (checks.length === 0) {
    lines.push("- no configured checks or tool adapters found");
    return;
  }

  for (const check of checks.slice(0, 16)) {
    lines.push(`- **${check.name}** (${check.source}, ${check.kind}, not run): \`${check.command}\``);
  }
}

export function appendSkills(lines: string[], skills: RedteamSkillSummary[]): void {
  lines.push("", "### Agent Skills", "");
  if (skills.length === 0) {
    lines.push("- no repo-local skills found");
    return;
  }

  for (const skill of skills.slice(0, 8)) {
    lines.push(`- **${skill.title}** (\`${skill.path}\`): ${skill.summary}`);
  }
}

export function appendSafety(lines: string[], bundle: AgentTaskBundle): void {
  lines.push(
    "",
    "### Safety And Limits",
    "",
    `- LLM/model called by CodeDecay: ${bundle.safety.llmCalled ? "yes" : "no"}`,
    `- Commands executed by CodeDecay: ${bundle.safety.commandsExecuted ? "yes" : "no"}`,
    `- Telemetry sent: ${bundle.safety.telemetrySent ? "yes" : "no"}`,
    `- Cloud dependency: ${bundle.safety.cloudDependency ? "yes" : "no"}`,
    `- Agent output trusted as evidence: ${bundle.safety.agentOutputTrusted ? "yes" : "no"}`,
    ""
  );

  appendList(lines, bundle.limits);
}
