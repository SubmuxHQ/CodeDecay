import type { CodeDecaySemgrepToolAdapter } from "../../types";
import { isPlainObject, normalizeNonEmptyString } from "../primitives";
import { normalizeToolSeverity } from "./enums";
import { normalizeCommandToolAdapter } from "./command";

export function normalizeSemgrepToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecaySemgrepToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.semgrep", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.semgrep must be a boolean or object.`);
  }

  const semgrep: CodeDecaySemgrepToolAdapter = { ...adapter };

  if (value.config !== undefined) {
    semgrep.config = normalizeNonEmptyString(value.config, "toolAdapters.semgrep.config", sourcePath);
  }

  if (value.reportPath !== undefined) {
    semgrep.reportPath = normalizeNonEmptyString(value.reportPath, "toolAdapters.semgrep.reportPath", sourcePath);
  }

  if (value.failOnSeverity !== undefined) {
    semgrep.failOnSeverity = normalizeToolSeverity(value.failOnSeverity, "toolAdapters.semgrep.failOnSeverity", sourcePath);
  }

  return semgrep;
}
