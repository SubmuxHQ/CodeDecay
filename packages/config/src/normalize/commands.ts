import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import { cloneCommands } from "../clone";
import type { CodeDecayCommands, CodeDecayProbe } from "../types";
import { isPlainObject, normalizePositiveInteger } from "./primitives";

export function normalizeCommands(value: unknown, sourcePath: string): CodeDecayCommands {
  if (value === undefined) {
    return cloneCommands(DEFAULT_CODEDECAY_CONFIG.commands);
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: commands must be an object.`);
  }

  return {
    test: normalizeCommandList(value.test, "commands.test", sourcePath),
    build: normalizeCommandList(value.build, "commands.build", sourcePath),
    start: normalizeCommandList(value.start, "commands.start", sourcePath)
  };
}

export function normalizeProbes(value: unknown, sourcePath: string): CodeDecayProbe[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes must be an array.`);
  }

  return value.map((probe, index) => normalizeProbe(probe, index, sourcePath));
}

function normalizeCommandList(value: unknown, field: string, sourcePath: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a string or string array.`);
}

function normalizeProbe(value: unknown, index: number, sourcePath: string): CodeDecayProbe {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes[${index}] must be an object.`);
  }

  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes[${index}].name is required.`);
  }

  if (typeof value.command !== "string" || value.command.trim().length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: probes[${index}].command is required.`);
  }

  const probe: CodeDecayProbe = {
    name: value.name,
    command: value.command
  };

  if (value.timeoutMs !== undefined) {
    probe.timeoutMs = normalizePositiveInteger(value.timeoutMs, `probes[${index}].timeoutMs`, sourcePath);
  }

  return probe;
}
