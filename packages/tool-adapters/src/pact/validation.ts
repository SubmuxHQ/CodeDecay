import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { PACT_HARNESS_NAME } from "./constants";
import { validateNonEmptyString } from "../shared/values";
import type { PactHarnessOptions } from "../types";

export function validatePactOptions(options: PactHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Pact command");

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Pact timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Pact outputLimit must be a positive integer.");
  }
}

export function validatePactPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== PACT_HARNESS_NAME) {
    throw new Error(`Pact harness cannot run plan for ${plan.harnessName}.`);
  }
}
