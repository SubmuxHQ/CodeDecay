import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import { createConfiguredToolHarnesses } from "@submuxhq/codedecay-tool-adapters";
import type { RedteamCheckKind, RedteamConfiguredCheck, RedteamToolAdapterPlan } from "./types";

export function collectConfiguredChecks(config: CodeDecayConfig): RedteamConfiguredCheck[] {
  return [
    ...config.commands.test.map((command, index) => createConfiguredCheck("test", `Test command ${index + 1}`, command)),
    ...config.commands.build.map((command, index) => createConfiguredCheck("build", `Build command ${index + 1}`, command)),
    ...config.commands.start.map((command, index) => createConfiguredCheck("start", `Start command ${index + 1}`, command)),
    ...config.probes.map((probe) => createConfiguredCheck("probe", probe.name, probe.command, probe.timeoutMs))
  ];
}

export function collectToolAdapterPlans(config: CodeDecayConfig): RedteamToolAdapterPlan[] {
  return createConfiguredToolHarnesses(config).map((configured) => {
    const plan: RedteamToolAdapterPlan = {
      kind: configured.kind,
      name: configured.name,
      command: configured.command,
      capabilities: [...configured.harness.capabilities],
      willRun: false,
      requiresApproval: !config.safety.allowCommands
    };

    if (configured.timeoutMs !== undefined) {
      plan.timeoutMs = configured.timeoutMs;
    }

    return plan;
  });
}

function createConfiguredCheck(
  kind: RedteamCheckKind,
  name: string,
  command: string,
  timeoutMs?: number | undefined
): RedteamConfiguredCheck {
  const check: RedteamConfiguredCheck = {
    kind,
    name,
    command,
    willRun: false
  };

  if (timeoutMs !== undefined) {
    check.timeoutMs = timeoutMs;
  }

  return check;
}
