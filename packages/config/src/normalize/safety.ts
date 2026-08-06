import { DEFAULT_CODEDECAY_CONFIG } from "../defaults";
import type { CodeDecaySafety } from "../types";
import { cloneCapabilityPolicy, normalizeCapabilityPolicy } from "./capability-policy";
import { isPlainObject, normalizeBoolean, normalizePositiveInteger } from "./primitives";

export function normalizeSafety(value: unknown, sourcePath: string): CodeDecaySafety {
  if (value === undefined) {
    return {
      commandTimeoutMs: DEFAULT_CODEDECAY_CONFIG.safety.commandTimeoutMs,
      allowCommands: DEFAULT_CODEDECAY_CONFIG.safety.allowCommands,
      capabilityPolicy: cloneCapabilityPolicy(DEFAULT_CODEDECAY_CONFIG.safety.capabilityPolicy)
    };
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

  const capabilityPolicy = normalizeCapabilityPolicy(
    value.capabilityPolicy,
    `${sourcePath}.capabilityPolicy`
  );

  return {
    commandTimeoutMs,
    allowCommands,
    capabilityPolicy
  };
}
