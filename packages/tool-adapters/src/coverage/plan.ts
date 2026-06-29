import type { HarnessPlan, HarnessPlanInput } from "@submuxhq/codedecay-harness";
import { COVERAGE_HARNESS_NAME } from "./constants";
import type { CoverageHarnessOptions } from "../types";

export function resolveCoverageDisplayCommand(options: Pick<CoverageHarnessOptions, "command">): string {
  return options.command ?? "collect coverage artifacts";
}

export function createCoveragePlan(input: HarnessPlanInput, command: string, allowCommands: boolean): HarnessPlan {
  return {
    id: "coverage-evidence",
    harnessName: COVERAGE_HARNESS_NAME,
    summary: "Run or collect configured coverage evidence from local artifacts.",
    requiresApproval: command !== "collect coverage artifacts" && !allowCommands,
    steps: [
      {
        id: "run-or-collect-coverage",
        title: "Run or collect coverage evidence",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}
