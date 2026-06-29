import type { CodeDecayCoverageToolAdapter } from "../../types";
import { isPlainObject, normalizeStringList } from "../primitives";
import { normalizeCoverageFailOn } from "./enums";
import { normalizeCommandToolAdapter } from "./command";

export function normalizeCoverageToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecayCoverageToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.coverage", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.coverage must be a boolean or object.`);
  }

  const coverage: CodeDecayCoverageToolAdapter = { ...adapter };

  if (value.reportPaths !== undefined) {
    coverage.reportPaths = normalizeStringList(value.reportPaths, "toolAdapters.coverage.reportPaths", sourcePath);
  }

  if (value.failOn !== undefined) {
    coverage.failOn = normalizeCoverageFailOn(value.failOn, "toolAdapters.coverage.failOn", sourcePath);
  }

  return coverage;
}
