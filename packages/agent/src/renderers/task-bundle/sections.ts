import type { RedteamFixTask, RedteamSkillSummary } from "@submuxhq/codedecay-redteam";
import { formatRisk, formatRoute, routeKindLabel } from "../../formatting";
import type { AgentEvidence, AgentSuggestedCheck, AgentTaskBundle } from "../../types";
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
  lines.push("Changed files:");
  appendList(lines, evidence.changedFiles.map((file) => `${file.status}: \`${file.path}\``));

  lines.push("", "Impacted areas:");
  if (evidence.impactedAreas.length === 0) {
    lines.push("- none detected");
  } else {
    for (const area of evidence.impactedAreas.slice(0, 12)) {
      lines.push(`- ${formatRisk(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
    }
  }

  lines.push("", "Impacted routes and APIs:");
  if (evidence.impactedRoutes.length === 0) {
    lines.push("- none detected");
  } else {
    for (const route of evidence.impactedRoutes.slice(0, 12)) {
      const files = route.files.map((file) => `\`${file}\``).join(", ");
      lines.push(`- ${formatRisk(route.risk)} \`${formatRoute(route)}\` (${routeKindLabel(route)}): ${files}`);

      for (const reason of route.reasons.slice(0, 2)) {
        lines.push(`  - ${reason}`);
      }

      if (route.recommendedTests.length > 0) {
        lines.push(`  - Suggested proof: ${route.recommendedTests[0]}`);
      }
    }
  }

  lines.push("", "Weak or missing test proof:");
  const testFindings = [...evidence.missingTestFindings, ...evidence.weakTestFindings];
  if (testFindings.length === 0) {
    lines.push("- no deterministic weak-test findings");
  } else {
    for (const finding of testFindings.slice(0, 12)) {
      const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
      lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
    }
  }

  lines.push("", "Scope and contract evidence:");
  const scopeFindings = [...evidence.scopeFindings, ...evidence.contractFindings];
  if (scopeFindings.length === 0) {
    lines.push("- no deterministic scope or contract findings");
  } else {
    for (const finding of scopeFindings.slice(0, 12)) {
      const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
      lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
    }
  }

  lines.push("", "Edge cases to check:");
  appendList(lines, evidence.edgeCases);

  lines.push("", "Product failure bundles:");
  if (evidence.productFailureBundles.length === 0) {
    lines.push("- none");
  } else {
    for (const bundle of evidence.productFailureBundles.slice(0, 8)) {
      const files = bundle.impactedFiles.length > 0 ? bundle.impactedFiles.map((file) => `\`${file}\``).join(", ") : "none";
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
}

export function appendTasks(lines: string[], tasks: RedteamFixTask[]): void {
  lines.push("", "### Tasks To Complete", "");
  if (tasks.length === 0) {
    lines.push("- no fix tasks generated");
    return;
  }

  for (const task of tasks.slice(0, 20)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(`- ${formatRisk(task.priority)} **${task.title}**${location}: ${task.detail}`);
    if (task.scope) {
      const files = task.scope.files.slice(0, 4).map((file) => `\`${file}\``).join(", ");
      const areas = task.scope.areas.join(", ");
      lines.push(`  - Scope: ${areas || "unknown area"}${files ? ` in ${files}` : ""}`);
    }
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
