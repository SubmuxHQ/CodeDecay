import type {
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryInvariant,
  MemoryRegression
} from "../types";

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
