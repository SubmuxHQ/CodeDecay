import { compareRiskLevels, type ImpactedArea, type RiskLevel } from "@submuxhq/codedecay-core";
import type { RedteamFixTask } from "../types";

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
    const key = task.source === "test-proof"
      ? `${task.source}:${task.title}:${task.file ?? ""}`
      : `${task.source}:${task.title}:${task.file ?? ""}:${task.line ?? ""}`;
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
