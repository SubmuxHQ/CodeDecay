import type { DashboardOptions } from "../types";
import { parseConfigFormat, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseDashboardArgs(args: string[]): DashboardOptions {
  const options: DashboardOptions = {
    format: "markdown",
    inputPaths: []
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

    if (arg.startsWith("--input=")) {
      options.inputPaths.push(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--input") {
      options.inputPaths.push(requireValue(args, index, arg));
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

    if (arg.startsWith("--format=")) {
      options.format = parseConfigFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseConfigFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "dashboard");
  }

  return options;
}
