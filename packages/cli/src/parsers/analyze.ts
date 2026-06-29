import type { AnalyzeOptions } from "../types";
import { parseFormat, parseRiskLevel, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseAnalyzeArgs(args: string[]): AnalyzeOptions {
  const options: AnalyzeOptions = {
    format: "markdown"
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
      options.format = parseFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseFormat(requireValue(args, index, arg));
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

    if (arg.startsWith("--fail-on=")) {
      options.failOn = parseRiskLevel(arg.slice("--fail-on=".length));
      continue;
    }

    if (arg === "--fail-on") {
      options.failOn = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "analyze");
  }

  return options;
}
