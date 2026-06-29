import type { CodeDecayMemory } from "./types";
import { normalizeArray, isPlainObject } from "./schema-primitives";
import {
  normalizeArchitectureNote,
  normalizeCommand,
  normalizeFlow,
  normalizeInvariant,
  normalizeRegression
} from "./schema-sections";

export { cloneMemory, isEmptyMemory } from "./schema-clone";
export { normalizeMatcher, normalizeProductPath } from "./schema-matcher";
export {
  isPlainObject,
  normalizeArray,
  normalizeObject,
  optionalAreas,
  optionalRiskLevel,
  optionalString,
  optionalStringArray,
  requiredString
} from "./schema-primitives";
export {
  normalizeArchitectureNote,
  normalizeCommand,
  normalizeFlow,
  normalizeInvariant,
  normalizeRegression
} from "./schema-sections";

export function parseJsonMemory(raw: string, sourcePath: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${message}`);
  }
}

export function normalizeMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: expected an object.`);
  }

  if (value.version !== 1) {
    throw new Error(`Invalid CodeDecay memory at ${sourcePath}: version must be 1.`);
  }

  return {
    version: 1,
    flows: normalizeArray(value.flows, sourcePath, "flows").map((item, index) => normalizeFlow(item, index, sourcePath)),
    commands: normalizeArray(value.commands, sourcePath, "commands").map((item, index) => normalizeCommand(item, index, sourcePath)),
    invariants: normalizeArray(value.invariants, sourcePath, "invariants").map((item, index) =>
      normalizeInvariant(item, index, sourcePath)
    ),
    architecture: normalizeArray(value.architecture, sourcePath, "architecture").map((item, index) =>
      normalizeArchitectureNote(item, index, sourcePath)
    ),
    regressions: normalizeArray(value.regressions, sourcePath, "regressions").map((item, index) =>
      normalizeRegression(item, index, sourcePath)
    )
  };
}
