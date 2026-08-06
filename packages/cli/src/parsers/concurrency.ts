import type { ConcurrencyOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseConcurrencyArgs(args: string[]): ConcurrencyOptions {
  const options: ConcurrencyOptions = { surfaceFiles: [], format: "markdown" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") throw new HelpRequested();
    const [flag, inline] = splitArg(arg);
    const value = () => inline ?? requireValue(args, index, flag);
    if (flag === "--experiment") options.experimentFile = value();
    else if (flag === "--surface") options.surfaceFiles.push(value());
    else if (flag === "--cwd") options.cwd = value();
    else if (flag === "--output") options.output = value();
    else if (flag === "--format") options.format = parseFormat(value());
    else if (flag === "--target-kind") options.targetKind = parseTarget(value());
    else if (flag === "--cleanup-plan") options.cleanupPlan = value();
    else {
      throwUnknownOption(arg, "concurrency");
      continue;
    }
    if (inline === undefined) index += 1;
  }
  return options;
}

function splitArg(arg: string): [string, string | undefined] {
  const index = arg.indexOf("=");
  return index < 0 ? [arg, undefined] : [arg.slice(0, index), arg.slice(index + 1)];
}

function parseFormat(value: string): ConcurrencyOptions["format"] {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Invalid concurrency format "${value}". Expected json or markdown.`);
}

function parseTarget(value: string): NonNullable<ConcurrencyOptions["targetKind"]> {
  if (
    value === "unspecified" ||
    value === "fixture-local" ||
    value === "disposable-local" ||
    value === "remote-unapproved" ||
    value === "production-like"
  ) {
    return value;
  }
  throw new Error(`Invalid concurrency target kind "${value}".`);
}
