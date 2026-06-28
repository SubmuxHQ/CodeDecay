import type { McpOptions } from "../types";
import { requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseMcpArgs(args: string[]): McpOptions {
  const options: McpOptions = {};

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

    throwUnknownOption(arg, "mcp");
  }

  return options;
}
