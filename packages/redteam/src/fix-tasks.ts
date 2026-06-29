import type { CodeDecayReport, Finding } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "./types";
import { dedupeTasks, edgeCasePriority, edgeCaseTaskTitle } from "./fix-tasks/helpers";
import { WEAK_TEST_RULES } from "./fix-tasks/rules";

export function createFixTasks(input: {
  analysisReport: CodeDecayReport;
  weakTestFindings: Finding[];
  edgeCases: string[];
  configuredChecks: RedteamConfiguredCheck[];
  toolAdapterPlans: RedteamToolAdapterPlan[];
  memory: CodeDecayMemory;
  skills: RedteamSkillSummary[];
}): RedteamFixTask[] {
  const tasks: RedteamFixTask[] = [];
  const prioritizedFindings = input.analysisReport.findings
    .filter((finding) => finding.severity !== "low")
    .slice(0, 8);
  const findings = prioritizedFindings.length > 0 ? prioritizedFindings : input.analysisReport.findings.slice(0, 5);

  for (const finding of findings) {
    tasks.push({
      title: `Investigate ${finding.title}`,
      priority: finding.severity,
      source: WEAK_TEST_RULES.has(finding.ruleId) ? "weak-test" : "finding",
      detail: finding.description,
      file: finding.file,
      line: finding.line
    });
  }

  for (const edgeCase of input.edgeCases.slice(0, 8)) {
    tasks.push({
      title: edgeCaseTaskTitle(edgeCase),
      priority: edgeCasePriority(input.analysisReport.impactedAreas),
      source: "edge-case",
      detail: edgeCase
    });
  }

  for (const check of input.configuredChecks.slice(0, 8)) {
    tasks.push({
      title: `Consider running configured ${check.kind} check`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "configured-check",
      detail: `${check.name}: ${check.command}`
    });
  }

  for (const adapter of input.toolAdapterPlans.slice(0, 8)) {
    tasks.push({
      title: `Consider running ${adapter.name} harness`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "tool-adapter",
      detail: `${adapter.kind}: ${adapter.command}`
    });
  }

  for (const bundle of (input.analysisReport.productFailureBundles ?? []).slice(0, 8)) {
    tasks.push({
      title: `Fix product failure: ${bundle.title}`,
      priority: bundle.priority,
      source: "product-failure",
      detail: `${bundle.summary} Rerun: ${bundle.rerunCommand}`,
      file: bundle.impactedFiles[0]
    });
  }

  for (const invariant of input.memory.invariants.slice(0, 4)) {
    tasks.push({
      title: `Verify invariant: ${invariant.name}`,
      priority: invariant.severity ?? "medium",
      source: "memory",
      detail: invariant.description
    });
  }

  for (const regression of input.memory.regressions.slice(0, 4)) {
    tasks.push({
      title: `Re-check past regression: ${regression.title}`,
      priority: regression.severity ?? "high",
      source: "memory",
      detail: regression.check ? `${regression.description} Check: ${regression.check}` : regression.description
    });
  }

  for (const skill of input.skills.slice(0, 4)) {
    tasks.push({
      title: `Review with skill: ${skill.title}`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "memory",
      detail: `${skill.summary} (${skill.path})`
    });
  }

  return dedupeTasks(tasks).slice(0, 20);
}
