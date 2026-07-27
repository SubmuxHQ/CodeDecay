import type { RedteamEdgeCase, RedteamFixTask } from "../../types";
import { formatProofGrade, formatRisk } from "../helpers";

export function appendEdgeCases(
  lines: string[],
  edgeCases: RedteamEdgeCase[],
  overflowCount: number
): void {
  lines.push("### Ranked Behavior Scenarios", "");
  if (edgeCases.length === 0) {
    lines.push("No PR-specific edge cases were generated.", "");
    return;
  }

  for (const [index, edgeCase] of edgeCases.entries()) {
    lines.push(
      `${index + 1}. **${edgeCase.title}** (${edgeCase.confidence} confidence, score ${edgeCase.score}/100, ${edgeCase.derivation})`,
      `   - Surface: ${formatScope(edgeCase)}`
    );
    if (edgeCase.downstreamConsumers.length > 0) {
      lines.push(
        `   - Downstream consumers: ${formatCodeItems(edgeCase.downstreamConsumers)}`
      );
    }
    if (edgeCase.scope.requirementIds.length > 0) {
      lines.push(
        `   - Requirements: ${formatCodeItems(edgeCase.scope.requirementIds)}`
      );
    }
    lines.push(
      `   - Trigger: ${edgeCase.trigger}`,
      `   - Expected invariant: ${edgeCase.expectedBehavior}`,
      `   - User-visible failure: ${edgeCase.userVisibleFailure}`,
      `   - Strongest proof: ${edgeCase.proof.recommendation}`,
      `   - Sources: ${edgeCase.sources.map((source) => `${source.kind}:${source.id}`).join(", ")}`
    );
  }
  if (overflowCount > 0) {
    lines.push(
      "",
      `${overflowCount} lower-ranked scenario${overflowCount === 1 ? " is" : "s are"} retained in JSON \`edgeCaseOverflow\`.`
    );
  }
  lines.push("");
}

export function appendFixTasks(lines: string[], tasks: RedteamFixTask[]): void {
  lines.push("### Tasks For Your Coding Agent", "");
  if (tasks.length === 0) {
    lines.push("No coding-agent fix tasks were generated.", "");
    return;
  }

  for (const task of tasks.slice(0, 12)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(
      `- ${formatRisk(task.priority)} **${task.title}**${location} [${formatProofGrade(task.proof)}]: ${task.detail}`
    );
  }
  lines.push("");
}

function formatScope(edgeCase: RedteamEdgeCase): string {
  const surfaces = [
    ...edgeCase.scope.routes,
    ...edgeCase.scope.symbols,
    ...edgeCase.scope.files,
    ...edgeCase.scope.flows
  ].slice(0, 5);
  return surfaces.length > 0 ? surfaces.map((surface) => `\`${surface}\``).join(", ") : "unknown";
}

function formatCodeItems(items: string[]): string {
  return items.slice(0, 5).map((item) => `\`${item}\``).join(", ");
}
