import type { RedteamExperimentPlan } from "../../types";

export function appendExperimentPlans(lines: string[], plans: RedteamExperimentPlan[]): void {
  if (plans.length === 0) {
    return;
  }

  lines.push("### Reviewable Experiment Plans", "");
  lines.push("These plans are report-only. CodeDecay will not run them until a user explicitly approves execution.", "");
  for (const plan of plans.slice(0, 6)) {
    lines.push(`- **${plan.id}** for \`${plan.hypothesisId}\` (${plan.status}, ${plan.approvalState}, ${plan.riskClass})`);
    lines.push(`  Target: ${plan.target.kind} - ${plan.target.name}`);
    lines.push(`  Tool: ${plan.toolAdapter.kind} - ${plan.toolAdapter.name} (${plan.toolAdapter.configured ? "configured" : "not configured"})`);
    lines.push(`  Oracle: ${plan.oracle.disconfirmingResult}`);
    lines.push(`  Network: ${plan.networkBoundary}`);
    if (plan.commands.length > 0) {
      lines.push(`  Commands: ${plan.commands.map((command) => command.command).join("; ")}`);
    }
    if (plan.requiredSecrets.length > 0) {
      lines.push(`  Env names: ${plan.requiredSecrets.join(", ")}`);
    }
    if (plan.attachedResults.length > 0) {
      lines.push(
        `  Attached results: ${plan.attachedResults
          .map((result) => `${result.checkName} ${result.status} (${result.proof})`)
          .join("; ")}`
      );
    }
    if (plan.limitations.length > 0) {
      lines.push(`  Limitations: ${plan.limitations.join("; ")}`);
    }
  }
  if (plans.length > 6) {
    lines.push(`- ${plans.length - 6} additional experiment plan(s) available in JSON output.`);
  }
  lines.push("");
}
