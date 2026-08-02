import type { RuntimeOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseRuntimeArgs(args: string[]): RuntimeOptions {
  const options: RuntimeOptions = { format: "markdown" };
  const valueOptions = new Map<string, keyof RuntimeOptions>([
    ["cwd", "cwd"],
    ["telemetry", "telemetry"],
    ["errors", "errors"],
    ["topology", "topology"],
    ["head-revision", "headRevision"],
    ["environment", "environment"],
    ["output", "output"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") throw new HelpRequested();
    if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
      continue;
    }
    if (arg === "--format") {
      options.format = parseFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    const key = match?.[1] ? valueOptions.get(match[1]) : undefined;
    if (key) {
      const value = match?.[2] ?? requireValue(args, index, arg);
      options[key] = value as never;
      if (match?.[2] === undefined) index += 1;
      continue;
    }
    throwUnknownOption(arg, "runtime");
  }
  return options;
}

function parseFormat(value: string): RuntimeOptions["format"] {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Invalid runtime format "${value}". Expected json or markdown.`);
}
