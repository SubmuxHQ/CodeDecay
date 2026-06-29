import {
  summarizeHarnessResult,
  type CodeDecayHarness
} from "@submuxhq/codedecay-harness";
import type { CoverageHarnessOptions } from "../types";
import { COVERAGE_HARNESS_NAME } from "./constants";
import { createCoveragePlan, resolveCoverageDisplayCommand } from "./plan";
import { runCoveragePlan } from "./run";
import { validateCoverageOptions } from "./validation";

export { resolveCoverageDisplayCommand };

export function createCoverageHarness(options: CoverageHarnessOptions = {}): CodeDecayHarness {
  validateCoverageOptions(options);

  return {
    name: COVERAGE_HARNESS_NAME,
    capabilities: ["coverage", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "coverage.command",
        description: "Optional command that runs the repo's own coverage-producing tests.",
        required: false
      },
      {
        key: "coverage.reportPaths",
        description: "Optional local Istanbul, LCOV, or V8 coverage artifact paths.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createCoveragePlan(input, resolveCoverageDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runCoveragePlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: COVERAGE_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${COVERAGE_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}
