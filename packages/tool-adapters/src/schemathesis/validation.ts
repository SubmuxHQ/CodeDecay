import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { SCHEMATHESIS_HARNESS_NAME } from "./constants";
import { validateNonEmptyString } from "../shared/values";
import type { SchemathesisHarnessOptions } from "../types";

export function validateSchemathesisOptions(options: SchemathesisHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Schemathesis command");

  if (options.schema !== undefined) {
    validateNonEmptyString(options.schema, "Schemathesis schema");
  }

  if (options.baseUrl !== undefined) {
    validateNonEmptyString(options.baseUrl, "Schemathesis baseUrl");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Schemathesis timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Schemathesis outputLimit must be a positive integer.");
  }
}

export function validateSchemathesisPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== SCHEMATHESIS_HARNESS_NAME) {
    throw new Error(`Schemathesis harness cannot run plan for ${plan.harnessName}.`);
  }
}
