import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { validateNonEmptyString } from "../shared/values";
import type {
  AgentProcessHarnessOptions,
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProfile
} from "../types";
import { AGENT_PROCESS_HARNESS_NAME } from "./constants";

export function validateAgentProcessOptions(options: AgentProcessHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Agent process command");
  }

  if (options.profile !== undefined && !isCodeDecayAgentProfile(options.profile)) {
    throw new Error("Agent process profile must be generic, codex, claude-code, cursor, pi, opencode, or desktop.");
  }

  if (options.bundleFormat !== undefined && !isAgentBundleFormat(options.bundleFormat)) {
    throw new Error("Agent process bundleFormat must be markdown or json.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Agent process timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Agent process outputLimit must be a positive integer.");
  }
}

export function validateAgentProcessPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== AGENT_PROCESS_HARNESS_NAME) {
    throw new Error(`Agent process harness cannot run plan for ${plan.harnessName}.`);
  }
}

export function isAgentBundleFormat(value: unknown): value is CodeDecayAgentBundleFormat {
  return value === "markdown" || value === "json";
}

function isCodeDecayAgentProfile(value: string): value is CodeDecayAgentProfile {
  return (
    value === "generic" ||
    value === "codex" ||
    value === "claude-code" ||
    value === "cursor" ||
    value === "pi" ||
    value === "opencode" ||
    value === "desktop"
  );
}
