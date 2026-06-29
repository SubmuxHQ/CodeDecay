import type { ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import {
  cloneMemory,
  normalizeArray,
  normalizeArchitectureNote,
  normalizeCommand,
  normalizeFlow,
  normalizeInvariant,
  normalizeMatcher,
  normalizeObject,
  normalizeProductPath,
  normalizeRegression,
  optionalRiskLevel,
  optionalString,
  optionalStringArray,
  requiredString
} from "./schema";
import type {
  CodeDecayMemory,
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryImportCounts,
  MemoryImportResult,
  MemoryInvariant,
  MemoryRegression
} from "./types";

export function importCodeDecayMemory(
  baseMemory: CodeDecayMemory,
  importedValue: unknown,
  sourceName: string = "memory import"
): MemoryImportResult {
  const importedMemory = normalizeImportedMemory(importedValue, sourceName);
  const base = cloneMemory(baseMemory);
  const added = createEmptyMemoryImportCounts();
  const merged = createEmptyMemoryImportCounts();

  return {
    memory: {
      version: 1,
      flows: mergeFlowEntries(base.flows, importedMemory.flows, added, merged),
      commands: mergeCommandEntries(base.commands, importedMemory.commands, added, merged),
      invariants: mergeInvariantEntries(base.invariants, importedMemory.invariants, added, merged),
      architecture: mergeArchitectureEntries(base.architecture, importedMemory.architecture, added, merged),
      regressions: mergeRegressionEntries(base.regressions, importedMemory.regressions, added, merged)
    },
    added,
    merged
  };
}

export function countMemoryEntries(memory: CodeDecayMemory): MemoryImportCounts {
  return {
    flows: memory.flows.length,
    commands: memory.commands.length,
    invariants: memory.invariants.length,
    architecture: memory.architecture.length,
    regressions: memory.regressions.length
  };
}

export function sortFlows(entries: MemoryFlow[]): MemoryFlow[] {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

export function sortCommands(entries: MemoryCommand[]): MemoryCommand[] {
  return [...entries].sort((left, right) => `${left.name}:${left.command}`.localeCompare(`${right.name}:${right.command}`));
}

export function sortInvariants(entries: MemoryInvariant[]): MemoryInvariant[] {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

export function sortArchitecture(entries: MemoryArchitectureNote[]): MemoryArchitectureNote[] {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title));
}

export function sortRegressions(entries: MemoryRegression[]): MemoryRegression[] {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title));
}

function normalizeImportedMemory(value: unknown, sourcePath: string): CodeDecayMemory {
  const object = normalizeObject(value, sourcePath, "root");
  if (object.version !== undefined && object.version !== 1) {
    throw new Error(`Invalid CodeDecay memory import at ${sourcePath}: version must be 1.`);
  }

  const flows = normalizeArray(object.flows, sourcePath, "flows").map((item, index) => normalizeFlow(item, index, sourcePath));
  const commands = normalizeArray(object.commands, sourcePath, "commands").map((item, index) => normalizeCommand(item, index, sourcePath));
  const invariants = normalizeArray(object.invariants, sourcePath, "invariants").map((item, index) =>
    normalizeInvariant(item, index, sourcePath)
  );
  const architecture = normalizeArray(object.architecture, sourcePath, "architecture").map((item, index) =>
    normalizeArchitectureNote(item, index, sourcePath)
  );
  const regressions = normalizeArray(object.regressions, sourcePath, "regressions").map((item, index) =>
    normalizeRegression(item, index, sourcePath)
  );
  const ciFailures = normalizeArray(object.ciFailures, sourcePath, "ciFailures").map((item, index) =>
    normalizeImportedRegression(item, index, sourcePath, "ciFailures")
  );
  const incidents = normalizeArray(object.incidents, sourcePath, "incidents").map((item, index) =>
    normalizeImportedRegression(item, index, sourcePath, "incidents")
  );
  const pullRequests = normalizeArray(object.pullRequests, sourcePath, "pullRequests").map((item, index) =>
    normalizeImportedPullRequest(item, index, sourcePath)
  );

  return {
    version: 1,
    flows: sortFlows([...flows, ...pullRequests.flatMap((entry) => entry.flows)]),
    commands: sortCommands([...commands, ...pullRequests.flatMap((entry) => entry.commands)]),
    invariants: sortInvariants(invariants),
    architecture: sortArchitecture([...architecture, ...pullRequests.flatMap((entry) => entry.architecture)]),
    regressions: sortRegressions([
      ...regressions,
      ...ciFailures,
      ...incidents,
      ...pullRequests.flatMap((entry) => entry.regressions)
    ])
  };
}

function normalizeImportedRegression(
  value: unknown,
  index: number,
  sourcePath: string,
  field: "ciFailures" | "incidents"
): MemoryRegression {
  const object = normalizeObject(value, sourcePath, `${field}[${index}]`);
  return {
    title: requiredString(object.title ?? object.name, sourcePath, `${field}[${index}].title`),
    description: requiredString(object.description ?? object.summary, sourcePath, `${field}[${index}].description`),
    check: optionalString(object.check, sourcePath, `${field}[${index}].check`),
    severity: optionalRiskLevel(object.severity, sourcePath, `${field}[${index}].severity`) ?? "high",
    ...normalizeMatcher(object, sourcePath, `${field}[${index}]`)
  };
}

function normalizeImportedPullRequest(
  value: unknown,
  index: number,
  sourcePath: string
): {
  flows: MemoryFlow[];
  commands: MemoryCommand[];
  architecture: MemoryArchitectureNote[];
  regressions: MemoryRegression[];
} {
  const object = normalizeObject(value, sourcePath, `pullRequests[${index}]`);
  const title = requiredString(object.title, sourcePath, `pullRequests[${index}].title`);
  const description =
    optionalString(object.description, sourcePath, `pullRequests[${index}].description`) ??
    optionalString(object.summary, sourcePath, `pullRequests[${index}].summary`) ??
    `Merged PR learning for ${title}.`;
  const matcher = normalizeMatcher(object, sourcePath, `pullRequests[${index}]`);
  const checks = optionalStringArray(object.checks, sourcePath, `pullRequests[${index}].checks`) ?? [];
  const command = optionalString(object.command, sourcePath, `pullRequests[${index}].command`);

  return {
    flows:
      checks.length > 0
        ? [
            {
              name: title,
              description,
              checks,
              ...matcher
            }
          ]
        : [],
    commands:
      command
        ? [
            {
              name: `${title} check`,
              command,
              description,
              ...matcher
            }
          ]
        : [],
    architecture: [
      {
        title,
        note: description,
        ...matcher
      }
    ],
    regressions:
      checks.length > 0
        ? [
            {
              title,
              description,
              check: checks[0],
              severity: "medium",
              ...matcher
            }
          ]
        : []
  };
}

function mergeFlowEntries(
  baseEntries: MemoryFlow[],
  importedEntries: MemoryFlow[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryFlow[] {
  return sortFlows(mergeNamedEntries(baseEntries, importedEntries, "flows", added, merged, mergeFlow));
}

function mergeCommandEntries(
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

function mergeInvariantEntries(
  baseEntries: MemoryInvariant[],
  importedEntries: MemoryInvariant[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryInvariant[] {
  return sortInvariants(mergeNamedEntries(baseEntries, importedEntries, "invariants", added, merged, mergeInvariant));
}

function mergeArchitectureEntries(
  baseEntries: MemoryArchitectureNote[],
  importedEntries: MemoryArchitectureNote[],
  added: MemoryImportCounts,
  merged: MemoryImportCounts
): MemoryArchitectureNote[] {
  return sortArchitecture(mergeNamedEntries(baseEntries, importedEntries, "architecture", added, merged, mergeArchitectureNote));
}

function mergeRegressionEntries(
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

function createEmptyMemoryImportCounts(): MemoryImportCounts {
  return {
    flows: 0,
    commands: 0,
    invariants: 0,
    architecture: 0,
    regressions: 0
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
