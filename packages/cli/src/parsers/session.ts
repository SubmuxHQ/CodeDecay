import type { SessionOptions } from "../types";
import { parseAgentProfile, parseConfigFormat, parsePositiveInteger, requireValue } from "./primitives";
import { HelpRequested, throwUnknownOption } from "./shared";

const SESSION_COMMANDS = new Set(["start", "context", "checkpoint", "finish"]);

export function parseSessionArgs(args: string[]): SessionOptions {
  const command = args[0];
  if (!command || !SESSION_COMMANDS.has(command)) {
    throw new Error("session requires one of: start, context, checkpoint, finish.");
  }

  const options: SessionOptions = {
    command: command as SessionOptions["command"],
    format: "markdown",
    profile: "generic"
  };
  const valueParsers = createSessionValueParsers(options);

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    const parsedOption = parseSessionValueOption(arg);
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

    throwUnknownOption(arg, "session");
  }

  validateSessionOptions(options);
  return options;
}

function createSessionValueParsers(options: SessionOptions): Record<string, (value: string) => void> {
  return {
    "--agent-output": (value) => {
      options.agentOutput = value;
    },
    "--cwd": (value) => {
      options.cwd = value;
    },
    "--format": (value) => {
      options.format = parseConfigFormat(value);
    },
    "--kind": (value) => {
      options.checkpointKind = parseCheckpointKind(value);
    },
    "--max-chars": (value) => {
      options.maxChars = parsePositiveInteger(value, "--max-chars");
    },
    "--max-nodes": (value) => {
      options.maxNodes = parsePositiveInteger(value, "--max-nodes");
    },
    "--output": (value) => {
      options.output = value;
    },
    "--profile": (value) => {
      options.profile = parseAgentProfile(value);
    },
    "--requirements": (value) => {
      options.requirements = value;
    },
    "--session": (value) => {
      options.session = value;
    },
    "--summary": (value) => {
      options.summary = value;
    },
    "--task": (value) => {
      options.task = value;
    }
  };
}

function validateSessionOptions(options: SessionOptions): void {
  if (options.command === "start" && !options.task?.trim()) {
    throw new Error("session start requires --task <description>.");
  }

  if (options.command !== "start" && !options.session?.trim()) {
    throw new Error(`session ${options.command} requires --session <id>.`);
  }

  if (options.command !== "checkpoint" && options.checkpointKind) {
    throw new Error("--kind is only supported for session checkpoint.");
  }
}

function parseCheckpointKind(value: string): Exclude<SessionOptions["checkpointKind"], undefined> {
  if (value === "plan" || value === "diff") {
    return value;
  }
  throw new Error(`Invalid checkpoint kind "${value}". Expected plan or diff.`);
}

function parseSessionValueOption(arg: string): { name: string; value?: string | undefined } | undefined {
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
