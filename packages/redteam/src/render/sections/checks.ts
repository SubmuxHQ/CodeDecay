import type { RedteamConfiguredCheck, RedteamToolAdapterPlan } from "../../types";

export function appendConfiguredChecks(lines: string[], checks: RedteamConfiguredCheck[]): void {
  lines.push("### Configured Checks Available", "");
  if (checks.length === 0) {
    lines.push("No test/build/start/probe commands are configured.", "");
    return;
  }

  for (const check of checks.slice(0, 12)) {
    lines.push(`- **${check.name}** (${check.kind}, not run): \`${check.command}\``);
  }
  lines.push("");
}

export function appendToolAdapterPlans(lines: string[], plans: RedteamToolAdapterPlan[]): void {
  lines.push("### Tool Adapter Plans", "");
  if (plans.length === 0) {
    lines.push("No Playwright, coverage, StrykerJS, Semgrep, Schemathesis, or Pact tool adapters are configured.", "");
    return;
  }

  for (const plan of plans.slice(0, 12)) {
    const approval = plan.requiresApproval ? "requires command approval" : "command approval configured";
    lines.push(`- **${plan.name}** (${plan.kind}, not run, ${approval}): \`${plan.command}\``);
  }
  lines.push("");
}
