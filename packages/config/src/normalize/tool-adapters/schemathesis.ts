import type { CodeDecaySchemathesisToolAdapter } from "../../types";
import { isPlainObject, normalizeNonEmptyString } from "../primitives";
import { normalizeCommandToolAdapter } from "./command";

export function normalizeSchemathesisToolAdapter(
  value: unknown,
  sourcePath: string
): CodeDecaySchemathesisToolAdapter | undefined {
  const adapter = normalizeCommandToolAdapter(value, "toolAdapters.schemathesis", sourcePath);
  if (!adapter || typeof value === "boolean") {
    return adapter;
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: toolAdapters.schemathesis must be a boolean or object.`);
  }

  const schemathesis: CodeDecaySchemathesisToolAdapter = { ...adapter };

  if (value.schema !== undefined) {
    schemathesis.schema = normalizeNonEmptyString(value.schema, "toolAdapters.schemathesis.schema", sourcePath);
  }

  if (value.baseUrl !== undefined) {
    schemathesis.baseUrl = normalizeNonEmptyString(value.baseUrl, "toolAdapters.schemathesis.baseUrl", sourcePath);
  }

  return schemathesis;
}
