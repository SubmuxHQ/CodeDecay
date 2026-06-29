import type { RedteamFixTask } from "../../types";
import { formatRisk } from "../helpers";

export function appendEdgeCases(lines: string[], edgeCases: string[]): void {
  lines.push("### Missing Edge Cases To Check", "");
  for (const edgeCase of edgeCases.slice(0, 12)) {
    lines.push(`- ${edgeCase}`);
  }
  lines.push("");
}

export function appendFixTasks(lines: string[], tasks: RedteamFixTask[]): void {
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
