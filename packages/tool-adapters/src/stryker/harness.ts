import {
  summarizeHarnessResult,
  type CodeDecayHarness,
} from "@submuxhq/codedecay-harness";
import {
  DEFAULT_STRYKER_COMMAND,
  STRYKER_HARNESS_NAME
} from "./constants";
import { createStrykerPlan } from "./plan";
import { runStrykerPlan } from "./run";
import { validateStrykerOptions } from "./validation";
import type { StrykerHarnessOptions } from "../types";

export function createStrykerHarness(options: StrykerHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_STRYKER_COMMAND;
  validateStrykerOptions({ ...options, command });

  return {
    name: STRYKER_HARNESS_NAME,
    capabilities: ["mutation-testing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "stryker.command",
        description: "Command that runs StrykerJS mutation tests for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createStrykerPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runStrykerPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: STRYKER_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${STRYKER_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}
