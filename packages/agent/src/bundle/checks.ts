import type {
  RedteamConfiguredCheck,
  RedteamToolAdapterPlan
} from "@submuxhq/codedecay-redteam";
import type { AgentSuggestedCheck } from "../types";

export function collectSuggestedChecks(
  configuredChecks: RedteamConfiguredCheck[],
  toolAdapterPlans: RedteamToolAdapterPlan[]
): AgentSuggestedCheck[] {
  return [
    ...configuredChecks.map((check) => ({
      source: "configured-command" as const,
      name: check.name,
      kind: check.kind,
      command: check.command,
      willRun: false as const
    })),
    ...toolAdapterPlans.map((plan) => ({
      source: "tool-adapter" as const,
      name: plan.name,
      kind: plan.kind,
      command: plan.command,
      willRun: false as const
    }))
  ];
}
