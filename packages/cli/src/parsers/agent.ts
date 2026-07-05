import type { AgentOptions } from "../types";
import { parseAgentFormat, parseAgentProfile, parseRiskLevel, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

const AGENT_TASK_SOURCES = [
  "finding",
  "weak-test",
  "edge-case",
  "configured-check",
  "tool-adapter",
  "memory",
  "pattern",
  "product-failure"
] as const;

type AgentTaskSourceValue = (typeof AGENT_TASK_SOURCES)[number];

export function parseAgentArgs(args: string[]): AgentOptions {
  const options: AgentOptions = {
    mode: "task-bundle",
    format: "markdown",
    profile: "generic"
  };

  let startIndex = 0;
  if (args[0] === "preflight") {
    options.mode = "preflight";
    startIndex = 1;
  }

  for (let index = startIndex; index < args.length; index += 1) {
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

    if (arg.startsWith("--format=")) {
      options.format = parseAgentFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseAgentFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profile = parseAgentProfile(arg.slice("--profile=".length));
      continue;
    }

    if (arg === "--profile") {
      options.profile = parseAgentProfile(requireValue(args, index, arg));
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

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--filter-source=")) {
      options.filterSource = parseFilterSource(arg.slice("--filter-source=".length));
      continue;
    }

    if (arg === "--filter-source") {
      options.filterSource = parseFilterSource(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--filter-priority=")) {
      options.filterPriority = parseRiskLevel(arg.slice("--filter-priority=".length));
      continue;
    }

    if (arg === "--filter-priority") {
      options.filterPriority = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--filter-file=")) {
      options.filterFile = arg.slice("--filter-file=".length);
      continue;
    }

    if (arg === "--filter-file") {
      options.filterFile = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--task=")) {
      options.task = arg.slice("--task=".length);
      continue;
    }

    if (arg === "--task") {
      options.task = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "agent");
  }

  if (options.mode === "preflight" && !options.task?.trim()) {
    throw new Error("agent preflight requires --task <description>.");
  }

  return options;
}

function parseFilterSource(value: string): AgentOptions["filterSource"] {
  if (AGENT_TASK_SOURCES.includes(value as AgentTaskSourceValue)) {
    return value as AgentTaskSourceValue;
  }

  throw new Error(`Invalid --filter-source "${value}". Expected ${AGENT_TASK_SOURCES.join(", ")}.`);
}
