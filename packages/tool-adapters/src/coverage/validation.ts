import type { HarnessPlan } from "@submuxhq/codedecay-harness";
import { validateNonEmptyString } from "../shared/values";
import type { CodeDecayCoverageFailOn, CoverageHarnessOptions } from "../types";
import { COVERAGE_HARNESS_NAME } from "./constants";

export function validateCoverageOptions(options: CoverageHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Coverage command");
  }

  if (options.reportPaths !== undefined) {
    if (options.reportPaths.length === 0) {
      throw new Error("Coverage reportPaths must contain at least one path.");
    }

    for (const reportPath of options.reportPaths) {
      validateNonEmptyString(reportPath, "Coverage reportPath");
    }
  }

  if (options.failOn !== undefined && !isCodeDecayCoverageFailOn(options.failOn)) {
    throw new Error("Coverage failOn must be none or uncovered.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Coverage timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Coverage outputLimit must be a positive integer.");
  }
}

export function validateCoveragePlan(plan: HarnessPlan): void {
  if (plan.harnessName !== COVERAGE_HARNESS_NAME) {
    throw new Error(`Coverage harness cannot run plan for ${plan.harnessName}.`);
  }
}

function isCodeDecayCoverageFailOn(value: string): value is CodeDecayCoverageFailOn {
  return value === "none" || value === "uncovered";
}
