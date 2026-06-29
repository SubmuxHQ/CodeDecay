import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { SEMGREP_HARNESS_NAME } from "./constants";
import { validateNonEmptyString } from "../shared/values";
import type { CodeDecayToolSeverity, SemgrepHarnessOptions } from "../types";

export function validateSemgrepOptions(options: SemgrepHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Semgrep command");
  }

  if (options.config !== undefined) {
    validateNonEmptyString(options.config, "Semgrep config");
    validateLocalSemgrepConfig(options.config);
  }

  if (options.reportPath !== undefined) {
    validateNonEmptyString(options.reportPath, "Semgrep reportPath");
  }

  if (options.failOnSeverity !== undefined && !isCodeDecayToolSeverity(options.failOnSeverity)) {
    throw new Error("Semgrep failOnSeverity must be low, medium, or high.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Semgrep timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Semgrep outputLimit must be a positive integer.");
  }
}

export function validateSemgrepPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== SEMGREP_HARNESS_NAME) {
    throw new Error(`Semgrep harness cannot run plan for ${plan.harnessName}.`);
  }
}

function validateLocalSemgrepConfig(config: string): void {
  const normalized = config.trim().toLowerCase();
  if (normalized === "auto" || normalized.includes("://") || normalized.startsWith("p/") || normalized.startsWith("r/")) {
    throw new Error("Semgrep config must be a local path. Use semgrep.command for registry, auto, or remote configs.");
  }
}

function isCodeDecayToolSeverity(value: string): value is CodeDecayToolSeverity {
  return value === "low" || value === "medium" || value === "high";
}
