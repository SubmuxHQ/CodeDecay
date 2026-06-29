import type { ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import type {
  CodeDecayMemory,
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryInvariant,
  MemoryMatcher,
  MemoryRegression
} from "./types";

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

export function normalizeMatcher(object: Record<string, unknown>, sourcePath: string, field: string): MemoryMatcher {
  const productPaths = optionalStringArray(object.productPaths, sourcePath, `${field}.productPaths`);

  return {
    files: optionalStringArray(object.files, sourcePath, `${field}.files`),
    areas: optionalAreas(object.areas, sourcePath, `${field}.areas`),
    productPaths: productPaths ? productPaths.map(normalizeProductPath) : undefined
  };
}

export function normalizeProductPath(path: string): string {
  const normalized = path.trim().split(/[?#]/, 1)[0] || "/";
  if (normalized === "/") {
    return normalized;
  }

  return trimTrailingSlashes(normalized) || "/";
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

export function normalizeArray(value: unknown, sourcePath: string, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be an array.`);
}

export function normalizeObject(value: unknown, sourcePath: string, field: string): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be an object.`);
}

export function requiredString(value: unknown, sourcePath: string, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} is required.`);
}

export function optionalString(value: unknown, sourcePath: string, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a string.`);
}

export function optionalStringArray(value: unknown, sourcePath: string, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be a string array.`);
}

export function optionalRiskLevel(value: unknown, sourcePath: string, field: string): RiskLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must be low, medium, or high.`);
}

export function optionalAreas(value: unknown, sourcePath: string, field: string): ImpactedArea["kind"][] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const validAreas = new Set(["api", "ui", "database", "auth", "config", "test", "source", "docs"]);
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && validAreas.has(item))) {
    return [...value] as ImpactedArea["kind"][];
  }

  throw new Error(`Invalid CodeDecay memory at ${sourcePath}: ${field} must contain valid impacted area names.`);
}

export function cloneMemory(memory: CodeDecayMemory): CodeDecayMemory {
  return {
    version: 1,
    flows: memory.flows.map((flow) => ({
      ...flow,
      files: flow.files ? [...flow.files] : undefined,
      areas: flow.areas ? [...flow.areas] : undefined,
      productPaths: flow.productPaths ? [...flow.productPaths] : undefined,
      checks: flow.checks ? [...flow.checks] : undefined
    })),
    commands: memory.commands.map((command) => ({
      ...command,
      files: command.files ? [...command.files] : undefined,
      areas: command.areas ? [...command.areas] : undefined,
      productPaths: command.productPaths ? [...command.productPaths] : undefined
    })),
    invariants: memory.invariants.map((invariant) => ({
      ...invariant,
      files: invariant.files ? [...invariant.files] : undefined,
      areas: invariant.areas ? [...invariant.areas] : undefined,
      productPaths: invariant.productPaths ? [...invariant.productPaths] : undefined
    })),
    architecture: memory.architecture.map((note) => ({
      ...note,
      files: note.files ? [...note.files] : undefined,
      areas: note.areas ? [...note.areas] : undefined,
      productPaths: note.productPaths ? [...note.productPaths] : undefined
    })),
    regressions: memory.regressions.map((regression) => ({
      ...regression,
      files: regression.files ? [...regression.files] : undefined,
      areas: regression.areas ? [...regression.areas] : undefined,
      productPaths: regression.productPaths ? [...regression.productPaths] : undefined
    }))
  };
}

export function isEmptyMemory(memory: CodeDecayMemory): boolean {
  return (
    memory.flows.length === 0 &&
    memory.commands.length === 0 &&
    memory.invariants.length === 0 &&
    memory.architecture.length === 0 &&
    memory.regressions.length === 0
  );
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
