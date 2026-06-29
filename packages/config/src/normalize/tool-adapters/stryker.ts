import type { CodeDecayStrykerToolAdapter } from "../../types";
import { isPlainObject, normalizeNonEmptyString } from "../primitives";
import { normalizeCommandToolAdapter } from "./command";

export function normalizeStrykerToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecayStrykerToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.stryker", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.stryker must be a boolean or object.`);
  }

  const stryker: CodeDecayStrykerToolAdapter = { ...adapter };

  if (value.reportPath !== undefined) {
    stryker.reportPath = normalizeNonEmptyString(value.reportPath, "toolAdapters.stryker.reportPath", sourcePath);
  }

  return stryker;
}
