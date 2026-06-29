import type { HarnessPlan, HarnessPlanInput } from "@submuxhq/codedecay-harness";
import { STRYKER_HARNESS_NAME } from "./constants";

export function createStrykerPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "stryker-mutation-testing",
    harnessName: STRYKER_HARNESS_NAME,
    summary: "Run configured StrykerJS mutation tests and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-stryker",
        title: "Run StrykerJS mutation tests",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}
