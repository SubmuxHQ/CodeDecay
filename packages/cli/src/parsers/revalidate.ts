import type { RevalidateOptions } from "../types";
import { parseConfigFormat, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseRevalidateArgs(args: string[]): RevalidateOptions {
  const options: RevalidateOptions = {
    input: "",
    format: "markdown",
    falsePositiveIds: [],
    acceptedRiskIds: [],
    applyMemory: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg === "--apply-memory") {
      options.applyMemory = true;
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

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
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

    if (arg.startsWith("--false-positive=")) {
      options.falsePositiveIds.push(arg.slice("--false-positive=".length));
      continue;
    }

    if (arg === "--false-positive") {
      options.falsePositiveIds.push(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--accept-risk=")) {
      options.acceptedRiskIds.push(arg.slice("--accept-risk=".length));
      continue;
    }

    if (arg === "--accept-risk") {
      options.acceptedRiskIds.push(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "revalidate");
  }

  if (!options.input) {
    throw new Error('Missing value for --input. Use "codedecay help revalidate" for usage.');
  }

  return options;
}
