import type { ContextOptions } from "../types";
import { parseConfigFormat, parsePositiveInteger, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

export function parseContextArgs(args: string[]): ContextOptions {
  const options: ContextOptions = {
    format: "markdown"
  };
  const valueParsers = createContextValueParsers(options);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    const parsedOption = parseContextValueOption(arg);
    if (parsedOption) {
      const parseValue = valueParsers[parsedOption.name];
      if (parseValue) {
        parseValue(parsedOption.value ?? requireValue(args, index, arg));
        if (parsedOption.value === undefined) {
          index += 1;
        }
        continue;
      }
    }

    throwUnknownOption(arg, "context");
  }

  return options;
}

function createContextValueParsers(options: ContextOptions): Record<string, (value: string) => void> {
  return {
    "--base": (value) => {
      options.base = value;
    },
    "--cwd": (value) => {
      options.cwd = value;
    },
    "--format": (value) => {
      options.format = parseConfigFormat(value);
    },
    "--head": (value) => {
      options.head = value;
    },
    "--max-nodes": (value) => {
      options.maxNodes = parsePositiveInteger(value, "--max-nodes");
    },
    "--output": (value) => {
      options.output = value;
    },
    "--requirements": (value) => {
      options.requirements = value;
    },
    "--task": (value) => {
      options.task = value;
    }
  };
}

function parseContextValueOption(arg: string): { name: string; value?: string | undefined } | undefined {
  if (!arg.startsWith("--")) {
    return undefined;
  }

  const equalsIndex = arg.indexOf("=");
  if (equalsIndex === -1) {
    return { name: arg };
  }

  return {
    name: arg.slice(0, equalsIndex),
    value: arg.slice(equalsIndex + 1)
  };
}
