import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { PLAYWRIGHT_HARNESS_NAME } from "./constants";
import { validateNonEmptyString } from "../shared/values";
import type { PlaywrightHarnessOptions } from "../types";

export function validatePlaywrightOptions(options: PlaywrightHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Playwright command");

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Playwright timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Playwright outputLimit must be a positive integer.");
  }
}

export function validatePlaywrightPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== PLAYWRIGHT_HARNESS_NAME) {
    throw new Error(`Playwright harness cannot run plan for ${plan.harnessName}.`);
  }
}
