import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { STRYKER_HARNESS_NAME } from "./constants";
import { validateNonEmptyString } from "../shared/values";
import type { StrykerHarnessOptions } from "../types";

export function validateStrykerOptions(options: StrykerHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "StrykerJS command");

  if (options.reportPath !== undefined) {
    validateNonEmptyString(options.reportPath, "StrykerJS reportPath");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("StrykerJS timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("StrykerJS outputLimit must be a positive integer.");
  }
}

export function validateStrykerPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== STRYKER_HARNESS_NAME) {
    throw new Error(`StrykerJS harness cannot run plan for ${plan.harnessName}.`);
  }
}
