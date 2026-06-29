import type {
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryInvariant,
  MemoryRegression
} from "./types";
import { normalizeMatcher } from "./schema-matcher";
import {
  normalizeObject,
  optionalRiskLevel,
  optionalString,
  optionalStringArray,
  requiredString
} from "./schema-primitives";

export function normalizeFlow(value: unknown, index: number, sourcePath: string): MemoryFlow {
  const object = normalizeObject(value, sourcePath, `flows[${index}]`);
  return {
    name: requiredString(object.name, sourcePath, `flows[${index}].name`),
    description: optionalString(object.description, sourcePath, `flows[${index}].description`),
    checks: optionalStringArray(object.checks, sourcePath, `flows[${index}].checks`),
    ...normalizeMatcher(object, sourcePath, `flows[${index}]`)
  };
}

export function normalizeCommand(value: unknown, index: number, sourcePath: string): MemoryCommand {
  const object = normalizeObject(value, sourcePath, `commands[${index}]`);
  return {
    name: requiredString(object.name, sourcePath, `commands[${index}].name`),
    command: requiredString(object.command, sourcePath, `commands[${index}].command`),
    description: optionalString(object.description, sourcePath, `commands[${index}].description`),
    ...normalizeMatcher(object, sourcePath, `commands[${index}]`)
  };
}

export function normalizeInvariant(value: unknown, index: number, sourcePath: string): MemoryInvariant {
  const object = normalizeObject(value, sourcePath, `invariants[${index}]`);
  return {
    name: requiredString(object.name, sourcePath, `invariants[${index}].name`),
    description: requiredString(object.description, sourcePath, `invariants[${index}].description`),
    severity: optionalRiskLevel(object.severity, sourcePath, `invariants[${index}].severity`),
    ...normalizeMatcher(object, sourcePath, `invariants[${index}]`)
  };
}

export function normalizeArchitectureNote(value: unknown, index: number, sourcePath: string): MemoryArchitectureNote {
  const object = normalizeObject(value, sourcePath, `architecture[${index}]`);
  return {
    title: requiredString(object.title, sourcePath, `architecture[${index}].title`),
    note: requiredString(object.note, sourcePath, `architecture[${index}].note`),
    ...normalizeMatcher(object, sourcePath, `architecture[${index}]`)
  };
}

export function normalizeRegression(value: unknown, index: number, sourcePath: string): MemoryRegression {
  const object = normalizeObject(value, sourcePath, `regressions[${index}]`);
  return {
    title: requiredString(object.title, sourcePath, `regressions[${index}].title`),
    description: requiredString(object.description, sourcePath, `regressions[${index}].description`),
    check: optionalString(object.check, sourcePath, `regressions[${index}].check`),
    severity: optionalRiskLevel(object.severity, sourcePath, `regressions[${index}].severity`),
    ...normalizeMatcher(object, sourcePath, `regressions[${index}]`)
  };
}
