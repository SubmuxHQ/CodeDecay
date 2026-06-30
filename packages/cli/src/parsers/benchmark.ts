import type { BenchmarkOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseBenchmarkArgs(args: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    format: "markdown",
    corpus: "default"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--format=")) {
      options.format = parseBenchmarkFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseBenchmarkFormat(requireValue(args, index, arg));
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

    if (arg.startsWith("--corpus=")) {
      options.corpus = arg.slice("--corpus=".length);
      continue;
    }

    if (arg === "--corpus") {
      options.corpus = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throwUnknownOption(arg, "benchmark");
  }

  return options;
}

function parseBenchmarkFormat(value: string): BenchmarkOptions["format"] {
  if (value === "json" || value === "markdown") {
    return value;
  }

  throw new Error(`Invalid benchmark format "${value}". Expected json or markdown.`);
}
