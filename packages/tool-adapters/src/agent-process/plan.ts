import type { HarnessPlan, HarnessPlanInput } from "@submuxhq/codedecay-harness";
import type { AgentProcessHarnessOptions } from "../types";
import {
  AGENT_PROCESS_BUNDLE_DIR,
  AGENT_PROCESS_HARNESS_NAME,
  DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT,
  DEFAULT_AGENT_PROCESS_PROFILE
} from "./constants";

export function createAgentProcessPlan(input: HarnessPlanInput, options: AgentProcessHarnessOptions): HarnessPlan {
  const command = options.command ?? "<agent command required>";
  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;

  return {
    id: "agent-process-review",
    harnessName: AGENT_PROCESS_HARNESS_NAME,
    summary: "Run a configured local agent process against a CodeDecay task bundle and collect untrusted suggestions.",
    requiresApproval: !options.allowCommands,
    steps: [
      {
        id: "prepare-agent-bundle",
        title: "Prepare agent task bundle",
        description: `Write a ${bundleFormat} CodeDecay agent bundle for profile ${profile} under ${AGENT_PROCESS_BUNDLE_DIR}.`
      },
      {
        id: "run-agent-process",
        title: "Run local agent process",
        description: `Run \`${command}\` from ${input.cwd} with CODEDECAY_AGENT_BUNDLE_PATH set.`
      }
    ]
  };
}
