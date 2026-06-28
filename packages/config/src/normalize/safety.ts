import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import type { CodeDecaySafety } from "../types";
import { isPlainObject, normalizeBoolean, normalizePositiveInteger } from "./primitives";

export function normalizeSafety(value: unknown, sourcePath: string): CodeDecaySafety {
  if (value === undefined) {
    return { ...DEFAULT_CODEDECAY_CONFIG.safety };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: safety must be an object.`);
  }

  const commandTimeoutMs =
    value.commandTimeoutMs === undefined
      ? DEFAULT_CODEDECAY_CONFIG.safety.commandTimeoutMs
      : normalizePositiveInteger(value.commandTimeoutMs, "safety.commandTimeoutMs", sourcePath);

  const allowCommands =
    value.allowCommands === undefined
      ? DEFAULT_CODEDECAY_CONFIG.safety.allowCommands
      : normalizeBoolean(value.allowCommands, "safety.allowCommands", sourcePath);

  return {
    commandTimeoutMs,
    allowCommands
  };
}
