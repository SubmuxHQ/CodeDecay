import type { CodeDecayMemory } from "./types";

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
