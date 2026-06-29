import {
  compareRiskLevels,
  type CodeDecayReport,
  type Finding,
  type ImpactedArea,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import { weakTestRuleIds as testAuditWeakTestRuleIds } from "@submuxhq/codedecay-test-audit";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "./types";

const WEAK_TEST_RULES = new Set(testAuditWeakTestRuleIds());

const EDGE_CASE_TASK_RULES: Array<{ title: string; keywords: string[] }> = [
  {
    title: "Add auth negative-path proof",
    keywords: ["auth", "credential", "privilege", "denied"]
  },
  {
    title: "Exercise the real API boundary",
    keywords: ["api", "route", "payload"]
  },
  {
    title: "Verify database and schema behavior",
    keywords: ["schema", "database", "migration", "record"]
  },
  {
    title: "Verify runtime configuration behavior",
    keywords: ["config", "environment", "build", "start"]
  },
  {
    title: "Strengthen test proof",
    keywords: ["test", "coverage", "assertion", "mock"]
  }
];

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

function edgeCaseTaskTitle(edgeCase: string): string {
  const lower = edgeCase.toLowerCase();

  for (const rule of EDGE_CASE_TASK_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) {
      return rule.title;
    }
  }

  return "Add concrete edge-case proof";
}

function edgeCasePriority(areas: ImpactedArea[]): RiskLevel {
  if (areas.some((area) => area.risk === "high")) {
    return "high";
  }

  if (areas.some((area) => area.risk === "medium")) {
    return "medium";
  }

  return "low";
}

function dedupeTasks(tasks: RedteamFixTask[]): RedteamFixTask[] {
  const seen = new Set<string>();
  const deduped: RedteamFixTask[] = [];

  for (const task of tasks) {
    const key = `${task.title}:${task.detail}:${task.file ?? ""}:${task.line ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(task);
  }

  return deduped.sort((left, right) => {
    const risk = compareRiskLevels(right.priority, left.priority);
    if (risk !== 0) {
      return risk;
    }

    return left.title.localeCompare(right.title);
  });
}
