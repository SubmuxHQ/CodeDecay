import {
  summarizeHarnessResult,
  type CodeDecayHarness,
} from "@submuxhq/codedecay-harness";
import type { AgentProcessHarnessOptions } from "../types";
import { createAgentProcessPlan } from "./plan";
import { runAgentProcessPlan } from "./run";
import {
  AGENT_PROCESS_HARNESS_NAME,
} from "./constants";
import { validateAgentProcessOptions } from "./validation";

export function createAgentProcessHarness(options: AgentProcessHarnessOptions = {}): CodeDecayHarness {
  validateAgentProcessOptions(options);

  return {
    name: AGENT_PROCESS_HARNESS_NAME,
    capabilities: ["agent-reasoning", "execution"],
    requiredConfig: [
      {
        key: "agentProcess.command",
        description: "Command that runs a local user-owned agent or agent harness.",
        required: true
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createAgentProcessPlan(input, options),
    run: async (plan, context) => runAgentProcessPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: AGENT_PROCESS_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${AGENT_PROCESS_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}
