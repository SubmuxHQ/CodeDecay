import {
  summarizeHarnessResult,
  type CodeDecayHarness,
} from "@submuxhq/codedecay-harness";
import { resolveSemgrepDisplayCommand } from "./commands";
import {
  SEMGREP_HARNESS_NAME
} from "./constants";
import { createSemgrepPlan } from "./plan";
import { runSemgrepPlan } from "./run";
import { validateSemgrepOptions } from "./validation";
import type { SemgrepHarnessOptions } from "../types";

export function createSemgrepHarness(options: SemgrepHarnessOptions = {}): CodeDecayHarness {
  validateSemgrepOptions(options);

  return {
    name: SEMGREP_HARNESS_NAME,
    capabilities: ["static-analysis", "execution"],
    requiredConfig: [
      {
        key: "semgrep.command",
        description: "Optional explicit command that runs Semgrep. Required for registry or remote configs.",
        required: false
      },
      {
        key: "semgrep.config",
        description: "Local Semgrep config path used when no explicit command is provided.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createSemgrepPlan(input, resolveSemgrepDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runSemgrepPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: SEMGREP_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${SEMGREP_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}
