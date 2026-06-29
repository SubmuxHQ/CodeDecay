import type {
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryImportCounts,
  MemoryInvariant,
  MemoryRegression
} from "../types";
import {
  cloneCommand,
  commandKey,
  firstDefinedString,
  higherRisk,
  mergeNamedEntries,
  mergeOptionalAreas,
  mergeOptionalProductPaths,
  mergeOptionalStringArrays,
  regressionKey
} from "./merge-helpers";
import {
  sortArchitecture,
  sortCommands,
  sortFlows,
  sortInvariants,
  sortRegressions
} from "./sort";

export function mergeFlowEntries(
  baseEntries: MemoryFlow[],
  importedEntries: MemoryFlow[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryFlow[] {
  return sortFlows(mergeNamedEntries(baseEntries, importedEntries, "flows", added, merged, mergeFlow));
}

export function mergeCommandEntries(
  baseEntries: MemoryCommand[],
  importedEntries: MemoryCommand[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryCommand[] {
  const map = new Map(baseEntries.map((entry) => [commandKey(entry), cloneCommand(entry)]));
  for (const entry of importedEntries) {
    const key = commandKey(entry);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, cloneCommand(entry));
      added.commands += 1;
      continue;
    }

    map.set(key, mergeCommand(existing, entry));
    merged.commands += 1;
  }

  return sortCommands([...map.values()]);
}

export function mergeInvariantEntries(
  baseEntries: MemoryInvariant[],
  importedEntries: MemoryInvariant[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryInvariant[] {
  return sortInvariants(mergeNamedEntries(baseEntries, importedEntries, "invariants", added, merged, mergeInvariant));
}

export function mergeArchitectureEntries(
  baseEntries: MemoryArchitectureNote[],
  importedEntries: MemoryArchitectureNote[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryArchitectureNote[] {
  return sortArchitecture(mergeNamedEntries(baseEntries, importedEntries, "architecture", added, merged, mergeArchitectureNote));
}

export function mergeRegressionEntries(
  baseEntries: MemoryRegression[],
  importedEntries: MemoryRegression[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryRegression[] {
  return sortRegressions(mergeNamedEntries(baseEntries, importedEntries, "regressions", added, merged, mergeRegression, regressionKey));
}

function mergeFlow(existing: MemoryFlow, incoming: MemoryFlow): MemoryFlow {
  return {
    name: existing.name,
    description: firstDefinedString(existing.description, incoming.description),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths),
    checks: mergeOptionalStringArrays(existing.checks, incoming.checks)
  };
}

function mergeCommand(existing: MemoryCommand, incoming: MemoryCommand): MemoryCommand {
  return {
    name: existing.name,
    command: existing.command,
    description: firstDefinedString(existing.description, incoming.description),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}

function mergeInvariant(existing: MemoryInvariant, incoming: MemoryInvariant): MemoryInvariant {
  return {
    name: existing.name,
    description: firstDefinedString(existing.description, incoming.description) ?? existing.description,
    severity: higherRisk(existing.severity, incoming.severity),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}

function mergeArchitectureNote(existing: MemoryArchitectureNote, incoming: MemoryArchitectureNote): MemoryArchitectureNote {
  return {
    title: existing.title,
    note: firstDefinedString(existing.note, incoming.note) ?? existing.note,
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}

function mergeRegression(existing: MemoryRegression, incoming: MemoryRegression): MemoryRegression {
  return {
    title: existing.title,
    description: firstDefinedString(existing.description, incoming.description) ?? existing.description,
    check: firstDefinedString(existing.check, incoming.check),
    severity: higherRisk(existing.severity, incoming.severity),
    files: mergeOptionalStringArrays(existing.files, incoming.files),
    areas: mergeOptionalAreas(existing.areas, incoming.areas),
    productPaths: mergeOptionalProductPaths(existing.productPaths, incoming.productPaths)
  };
}
