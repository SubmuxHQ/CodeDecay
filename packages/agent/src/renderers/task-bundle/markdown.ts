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
    `**Overall risk:** ${formatRisk(bundle.summary.riskLevel)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Merge risk | ${bundle.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${bundle.summary.decayScore}/100 |`,
    `| Changed files | ${bundle.summary.changedFiles} |`,
    `| Impacted areas | ${bundle.summary.impactedAreas} |`,
    `| Route/API impacts | ${bundle.summary.impactedRoutes} |`,
    `| Missing-test findings | ${bundle.summary.missingTestFindings} |`,
    `| Weak-test findings | ${bundle.summary.weakTestFindings} |`,
    `| Test proof status | ${bundle.summary.testProofStatus} |`,
    `| Edge cases | ${bundle.summary.edgeCases} |`,
    `| Product failure bundles | ${bundle.summary.productFailureBundles} |`,
    `| Fix tasks | ${bundle.summary.fixTasks} |`,
    "",
    "### Instructions For The Agent",
    ""
  ];

  appendList(lines, bundle.instructions);
  appendHandoff(lines, bundle.agentProfile);
  appendPrompt(lines, bundle.prompt);
  appendEvidence(lines, bundle.evidence);
  appendTasks(lines, bundle.tasks);
  appendChecks(lines, bundle.suggestedChecks);
  appendSkills(lines, bundle.skills);
  appendSafety(lines, bundle);

  return `${lines.join("\n")}\n`;
}
