import type { HarnessPlan, HarnessPlanInput } from "@submuxhq/codedecay-harness";
import { SEMGREP_HARNESS_NAME } from "./constants";

export function createSemgrepPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "semgrep-static-analysis",
    harnessName: SEMGREP_HARNESS_NAME,
    summary: "Run configured Semgrep static analysis and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-semgrep",
        title: "Run Semgrep static analysis",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}
