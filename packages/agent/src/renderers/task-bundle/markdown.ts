import { formatRisk } from "../../formatting";
import type { AgentTaskBundle } from "../../types";
import { appendList } from "./list";
import {
  appendChecks,
  appendEvidence,
  appendHandoff,
  appendPrompt,
  appendSafety,
  appendSkills,
  appendTasks
} from "./sections";

export function renderAgentTaskBundleMarkdown(bundle: AgentTaskBundle): string {
  const lines = [
    "## CodeDecay Agent Task Bundle",
    "",
    bundle.purpose,
    "",
    `**Status:** ${bundle.status}`,
    "",
    `**Overall risk:** ${formatRisk(bundle.summary.riskLevel)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Merge risk | ${bundle.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${bundle.summary.decayScore}/100 |`,
    `| Security risk | ${bundle.summary.securityScore}/100 |`,
    `| Changed files | ${bundle.summary.changedFiles} |`,
    `| Impacted areas | ${bundle.summary.impactedAreas} |`,
    `| Route/API impacts | ${bundle.summary.impactedRoutes} |`,
    `| Changed path proof entries | ${bundle.summary.testProofEntries} |`,
    `| Missing-test findings | ${bundle.summary.missingTestFindings} |`,
    `| Weak-test findings | ${bundle.summary.weakTestFindings} |`,
    `| Test proof status | ${bundle.summary.testProofStatus} |`,
    `| Edge cases | ${bundle.summary.edgeCases} |`,
    `| Product failure bundles | ${bundle.summary.productFailureBundles} |`,
    `| Fix tasks | ${bundle.summary.fixTasks} / ${bundle.summary.totalFixTasks} |`,
    `| Scope findings | ${bundle.summary.scopeFindings} |`,
    `| Contract findings | ${bundle.summary.contractFindings} |`,
    "",
    "### Instructions For The Agent",
    ""
  ];

  appendList(lines, bundle.instructions);
  appendRequirements(lines, bundle);
  appendInvestigation(lines, bundle);
  appendHandoff(lines, bundle.agentProfile);
  appendPrompt(lines, bundle.prompt);
  appendEvidence(lines, bundle.evidence);
  appendTasks(lines, bundle.tasks);
  appendChecks(lines, bundle.suggestedChecks);
  appendSkills(lines, bundle.skills);
  appendSafety(lines, bundle);

  return `${lines.join("\n")}\n`;
}

function appendInvestigation(lines: string[], bundle: AgentTaskBundle): void {
  if (!bundle.investigation) {
    return;
  }
  lines.push("", "### Untrusted Agent Investigation", "", `Status: ${bundle.investigation.status}`, "");
  appendList(
    lines,
    bundle.investigation.suggestions.map((suggestion) => {
      const proof = suggestion.proposedProof?.length ? ` Proposed proof: ${suggestion.proposedProof.join(" ")}` : "";
      return `${suggestion.title}: ${suggestion.detail}.${proof}`;
    })
  );
}

function appendRequirements(lines: string[], bundle: AgentTaskBundle): void {
  if (!bundle.requirements) {
    return;
  }

  lines.push("", "### Requirement Evidence", "", "Acceptance criteria:");
  appendList(
    lines,
    bundle.requirements.acceptanceCriteria.map((criterion) => {
      const proof = criterion.requiredProof.length > 0
        ? ` Required proof: ${criterion.requiredProof.join(" ")}`
        : "";
      return `${criterion.id}: ${criterion.text} [sources: ${criterion.sourceIds.join(", ")}].${proof}`;
    })
  );
  lines.push("", "Provenance:");
  appendList(
    lines,
    bundle.requirements.sources.map((source) => `\`${source.id}\` (${source.kind}): ${source.label}`)
  );
}
