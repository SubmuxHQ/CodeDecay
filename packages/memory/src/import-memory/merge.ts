import type { ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { normalizeProductPath } from "../schema";
import type {
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryImportCounts,
  MemoryInvariant,
  MemoryRegression
} from "../types";
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

function mergeNamedEntries<
  T extends {
    name?: string;
    title?: string;
    files?: string[] | undefined;
    areas?: ImpactedArea["kind"][] | undefined;
    productPaths?: string[] | undefined;
  }
>(
  baseEntries: T[],
  importedEntries: T[],
  section: keyof MemoryImportCounts,
  added: MemoryImportCounts,
  merged: MemoryImportCounts,
  mergeEntry: (existing: T, incoming: T) => T,
  keyForEntry: (entry: T) => string = namedKey
): T[] {
  const map = new Map(baseEntries.map((entry) => [keyForEntry(entry), structuredCloneEntry(entry)]));
  for (const entry of importedEntries) {
    const key = keyForEntry(entry);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, structuredCloneEntry(entry));
      added[section] += 1;
      continue;
    }

    map.set(key, mergeEntry(existing, entry));
    merged[section] += 1;
  }

  return [...map.values()];
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

function commandKey(command: MemoryCommand): string {
  return `${command.name.toLowerCase()}::${command.command.toLowerCase()}`;
}

function namedKey(entry: { name?: string; title?: string }): string {
  return normalizeMemoryKey(entry.name ?? entry.title ?? "");
}

function regressionKey(entry: MemoryRegression): string {
  const title = normalizeMemoryKey(entry.title);
  const files = normalizeMemoryKey(dedupeStrings(entry.files ?? []).join(","));
  const areas = normalizeMemoryKey(dedupeStrings(entry.areas ?? []).join(","));
  const productPaths = normalizeMemoryKey(dedupeStrings(entry.productPaths ?? []).join(","));
  const hasMatcherContext = Boolean(files || areas || productPaths);

  if (hasMatcherContext) {
    return [title, files, areas, productPaths].join("::");
  }

  return [title, normalizeMemoryKey(entry.check ?? ""), normalizeMemoryKey(entry.description).slice(0, 160)].join("::");
}

function normalizeMemoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstDefinedString(left: string | undefined, right: string | undefined): string | undefined {
  return left && left.length > 0 ? left : right;
}

function mergeOptionalStringArrays(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])]);
  return merged.length > 0 ? merged : undefined;
}

function mergeOptionalProductPaths(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])].map(normalizeProductPath));
  return merged.length > 0 ? merged : undefined;
}

function mergeOptionalAreas(
  left: ImpactedArea["kind"][] | undefined,
  right: ImpactedArea["kind"][] | undefined
): ImpactedArea["kind"][] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])]) as ImpactedArea["kind"][];
  return merged.length > 0 ? merged : undefined;
}

function higherRisk(left: RiskLevel | undefined, right: RiskLevel | undefined): RiskLevel | undefined {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  if (left === "high" || right === "high") {
    return "high";
  }

  if (left === "medium" || right === "medium") {
    return "medium";
  }

  return "low";
}

function cloneCommand(command: MemoryCommand): MemoryCommand {
  return {
    ...command,
    files: command.files ? [...command.files] : undefined,
    areas: command.areas ? [...command.areas] : undefined,
    productPaths: command.productPaths ? [...command.productPaths] : undefined
  };
}

function structuredCloneEntry<
  T extends {
    files?: string[] | undefined;
    areas?: ImpactedArea["kind"][] | undefined;
    productPaths?: string[] | undefined;
  }
>(
  entry: T
): T {
  return {
    ...entry,
    files: entry.files ? [...entry.files] : undefined,
    areas: entry.areas ? [...entry.areas] : undefined,
    productPaths: entry.productPaths ? [...entry.productPaths] : undefined
  };
}
