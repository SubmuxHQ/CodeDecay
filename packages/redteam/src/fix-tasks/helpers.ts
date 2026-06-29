import { compareRiskLevels, type ImpactedArea, type RiskLevel } from "@submuxhq/codedecay-core";
import type { RedteamFixTask } from "../types";
import { EDGE_CASE_TASK_RULES } from "./rules";

export function edgeCaseTaskTitle(edgeCase: string): string {
  const lower = edgeCase.toLowerCase();

  for (const rule of EDGE_CASE_TASK_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) {
      return rule.title;
    }
  }

  return "Add concrete edge-case proof";
}

export function edgeCasePriority(areas: ImpactedArea[]): RiskLevel {
  if (areas.some((area) => area.risk === "high")) {
    return "high";
  }

  if (areas.some((area) => area.risk === "medium")) {
    return "medium";
  }

  return "low";
}

export function dedupeTasks(tasks: RedteamFixTask[]): RedteamFixTask[] {
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
