import type { AiOptions } from "../types";
import { parseAgentArgs } from "./agent";
import { parseRiskLevel, requireValue } from "./primitives";

export function parseAiArgs(args: string[]): AiOptions {
  const agentArgs: string[] = [];
  let withChecks = false;
  let failOn: AiOptions["failOn"];
  let failOnRequirements = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--with-checks") {
      withChecks = true;
      continue;
    }

    if (arg === "--fail-on-requirements") {
      failOnRequirements = true;
      continue;
    }

    if (arg?.startsWith("--fail-on=")) {
      failOn = parseRiskLevel(arg.slice("--fail-on=".length));
      continue;
    }

    if (arg === "--fail-on") {
      failOn = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg) {
      agentArgs.push(arg);
    }
  }

  const options: AiOptions = {
    ...parseAgentArgs(agentArgs, {
      commandName: "ai",
      profile: "codex"
    }),
    ...(withChecks ? { withChecks: true } : {}),
    ...(failOn ? { failOn } : {}),
    ...(failOnRequirements ? { failOnRequirements: true } : {})
  };

  if (options.mode === "preflight") {
    if (options.withChecks) {
      throw new Error("ai preflight does not support --with-checks; run codedecay ai after the agent edits code.");
    }
    if (options.failOn) {
      throw new Error("ai preflight does not support --fail-on; run codedecay ai after the agent edits code.");
    }
    if (options.failOnRequirements) {
      throw new Error(
        "ai preflight does not support --fail-on-requirements; run codedecay ai after the agent edits code."
      );
    }
  }

  return options;
}
