import type { ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { normalizeProductPath } from "../schema";
import type { MemoryCommand, MemoryImportCounts, MemoryRegression } from "../types";

export function mergeNamedEntries<
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

export function commandKey(command: MemoryCommand): string {
  return `${command.name.toLowerCase()}::${command.command.toLowerCase()}`;
}

export function regressionKey(entry: MemoryRegression): string {
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

export function firstDefinedString(left: string | undefined, right: string | undefined): string | undefined {
  return left && left.length > 0 ? left : right;
}

export function mergeOptionalStringArrays(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])]);
  return merged.length > 0 ? merged : undefined;
}

export function mergeOptionalProductPaths(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])].map(normalizeProductPath));
  return merged.length > 0 ? merged : undefined;
}

export function mergeOptionalAreas(
  left: ImpactedArea["kind"][] | undefined,
  right: ImpactedArea["kind"][] | undefined
): ImpactedArea["kind"][] | undefined {
  const merged = dedupeStrings([...(left ?? []), ...(right ?? [])]) as ImpactedArea["kind"][];
  return merged.length > 0 ? merged : undefined;
}

export function higherRisk(left: RiskLevel | undefined, right: RiskLevel | undefined): RiskLevel | undefined {
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

export function cloneCommand(command: MemoryCommand): MemoryCommand {
  return {
    ...command,
    files: command.files ? [...command.files] : undefined,
    areas: command.areas ? [...command.areas] : undefined,
    productPaths: command.productPaths ? [...command.productPaths] : undefined
  };
}

function namedKey(entry: { name?: string; title?: string }): string {
  return normalizeMemoryKey(entry.name ?? entry.title ?? "");
}

function normalizeMemoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
