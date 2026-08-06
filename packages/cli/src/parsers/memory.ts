import type {
  MemoryImportOptions,
  MemoryLearnOptions,
  MemoryLearningOptions,
  MemoryOptions,
  MemorySetupOptions,
  MemorySetupProvider
} from "../types";
import { parseConfigFormat, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseMemoryArgs(args: string[]): MemoryOptions {
  const options: MemoryOptions = {
    format: "json"
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

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "memory");
  }

  return options;
}

export function parseMemorySetupArgs(args: string[]): MemorySetupOptions {
  const options: MemorySetupOptions = {
    format: "markdown",
    provider: "all",
    apply: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
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
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      options.provider = parseMemorySetupProvider(arg.slice("--provider=".length));
      continue;
    }

    if (arg === "--provider") {
      options.provider = parseMemorySetupProvider(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "memory");
  }

  return options;
}

function parseMemorySetupProvider(value: string): MemorySetupProvider {
  if (value === "local" || value === "mem0" || value === "supermemory" || value === "all") {
    return value;
  }

  throw new Error("--provider must be local, mem0, supermemory, or all.");
}

export function parseMemoryImportArgs(args: string[]): MemoryImportOptions {
  const options: MemoryImportOptions = {
    input: "",
    format: "markdown",
    apply: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
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

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--input") {
      options.input = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "memory-import");
  }

  if (!options.input) {
    throw new Error('Missing value for --input. Use "codedecay help memory-import" for usage.');
  }

  return options;
}

export function parseMemoryLearnArgs(args: string[]): MemoryLearnOptions {
  const options: MemoryLearnOptions = {
    input: "",
    format: "markdown",
    apply: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
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

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--input") {
      options.input = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "memory-learn");
  }

  if (!options.input) {
    throw new Error('Missing value for --input. Use "codedecay help memory-learn" for usage.');
  }

  return options;
}

export function parseMemoryLearningArgs(args: string[]): MemoryLearningOptions {
  const options: MemoryLearningOptions = {
    format: "json",
    apply: false,
    action: "approve",
    actor: "maintainer",
    reason: "Explicit human review of learning event."
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

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }
    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg.startsWith("--action=")) {
      options.action = parseLearningAction(arg.slice("--action=".length));
      continue;
    }
    if (arg === "--action") {
      options.action = parseLearningAction(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--event-id=")) {
      options.eventId = arg.slice("--event-id=".length);
      continue;
    }
    if (arg === "--event-id") {
      options.eventId = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--actor=")) {
      options.actor = arg.slice("--actor=".length);
      continue;
    }
    if (arg === "--actor") {
      options.actor = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--reason=")) {
      options.reason = arg.slice("--reason=".length);
      continue;
    }
    if (arg === "--reason") {
      options.reason = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }
    if (arg === "--input") {
      options.input = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--evidence-id=")) {
      options.evidenceIds = [...(options.evidenceIds ?? []), arg.slice("--evidence-id=".length)];
      continue;
    }
    if (arg === "--evidence-id") {
      options.evidenceIds = [...(options.evidenceIds ?? []), requireValue(args, index, arg)];
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "memory learning");
  }

  if (options.action === "propose" && !options.input) {
    throw new Error('Missing value for --input. Propose requires a JSON learning event file.');
  }

  if (options.action !== "propose" && !options.eventId) {
    throw new Error('Missing value for --event-id. Use "codedecay memory learning --help" for usage.');
  }

  return options;
}

function parseLearningAction(value: string): MemoryLearningOptions["action"] {
  if (
    value === "approve" ||
    value === "reject" ||
    value === "supersede" ||
    value === "expire" ||
    value === "revoke" ||
    value === "propose"
  ) {
    return value;
  }
  throw new Error(`Invalid --action ${value}. Expected approve|reject|supersede|expire|revoke|propose.`);
}
