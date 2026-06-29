import type { CodeDecayCommandToolAdapter } from "../../types";
import {
  isPlainObject,
  normalizeBoolean,
  normalizeNonEmptyString,
  normalizePositiveInteger
} from "../primitives";

export function normalizeCommandToolAdapter(
  value: unknown,
  field: string,
  sourcePath: string
): CodeDecayCommandToolAdapter | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return {
      enabled: value
    };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a boolean or object.`);
  }

  const adapter: CodeDecayCommandToolAdapter = {
    enabled: value.enabled === undefined ? true : normalizeBoolean(value.enabled, `${field}.enabled`, sourcePath)
  };

  if (value.command !== undefined) {
    adapter.command = normalizeNonEmptyString(value.command, `${field}.command`, sourcePath);
  }

  if (value.timeoutMs !== undefined) {
    adapter.timeoutMs = normalizePositiveInteger(value.timeoutMs, `${field}.timeoutMs`, sourcePath);
  }

  return adapter;
}
