import type { LoopFormat } from "@submuxhq/codedecay-harness";
import type { LoopOptions } from "../types";
import { parseRiskLevel, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseLoopArgs(args: string[]): LoopOptions {
  const options: LoopOptions = {
    maxRounds: 4,
    format: "markdown",
    safeRiskLevel: "low"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-rounds=")) {
      options.maxRounds = parseMaxRounds(arg.slice("--max-rounds=".length));
      continue;
    }

    if (arg === "--max-rounds") {
      options.maxRounds = parseMaxRounds(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--agent-cmd=")) {
      options.agentCommand = arg.slice("--agent-cmd=".length);
      continue;
    }

    if (arg === "--agent-cmd") {
      options.agentCommand = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseLoopFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseLoopFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--safe-risk=")) {
      options.safeRiskLevel = parseRiskLevel(arg.slice("--safe-risk=".length));
      continue;
    }

    if (arg === "--safe-risk") {
      options.safeRiskLevel = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "loop");
  }

  return options;
}

function parseLoopFormat(value: string): LoopFormat {
  if (value === "json" || value === "markdown") {
    return value;
  }

  throw new Error(`Invalid loop format "${value}". Expected json or markdown.`);
}

function parseMaxRounds(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new Error(`Invalid --max-rounds "${value}". Expected a positive integer.`);
}
