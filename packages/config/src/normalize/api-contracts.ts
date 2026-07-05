import type { CodeDecayApiContractsConfig } from "../types";
import { isPlainObject, normalizeStringList } from "./primitives";

export function normalizeApiContracts(value: unknown, sourcePath: string): CodeDecayApiContractsConfig {
  if (value === undefined) {
    return { openapi: [] };
  }

  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: apiContracts must be an object.`);
  }

  return {
    openapi: value.openapi === undefined
      ? []
      : normalizeStringList(value.openapi, "apiContracts.openapi", sourcePath)
  };
}
