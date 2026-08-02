import type { MigrationOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseMigrationArgs(args: string[]): MigrationOptions {
  const options: MigrationOptions = { files: [], rollbackFiles: [], targetKind: "unspecified", format: "markdown" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") throw new HelpRequested();
    const [flag, inline] = splitArg(arg);
    const value = () => inline ?? requireValue(args, index, flag);
    if (flag === "--file") options.files.push(value());
    else if (flag === "--rollback-file") options.rollbackFiles.push(value());
    else if (flag === "--cwd") options.cwd = value();
    else if (flag === "--output") options.output = value();
    else if (flag === "--format") options.format = parseFormat(value());
    else if (flag === "--target-kind") options.targetKind = parseTarget(value());
    else { throwUnknownOption(arg, "migration"); continue; }
    if (inline === undefined) index += 1;
  }
  return options;
}

function splitArg(arg: string): [string, string | undefined] {
  const index = arg.indexOf("=");
  return index < 0 ? [arg, undefined] : [arg.slice(0, index), arg.slice(index + 1)];
}

function parseFormat(value: string): MigrationOptions["format"] {
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Invalid migration format "${value}". Expected json or markdown.`);
}

function parseTarget(value: string): MigrationOptions["targetKind"] {
  if (value === "unspecified" || value === "disposable-local" || value === "remote-unapproved" || value === "production-like") return value;
  throw new Error(`Invalid migration target kind "${value}".`);
}
