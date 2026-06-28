import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  importCodeDecayMemory,
  learnCodeDecayMemory,
  loadCodeDecayMemory,
  writeCodeDecayMemory
} from "@submuxhq/codedecay-memory";
import { write } from "../io";
import {
  parseMemoryArgs,
  parseMemoryImportArgs,
  parseMemoryLearnArgs
} from "../parsers/args";
import {
  renderMemory,
  renderMemoryImportResult,
  renderMemoryLearnResult
} from "../renderers/memory";
import type { CliCommandContext } from "../types";

export interface MemoryCommandDependencies {
  resolveRepoRoot(cwd: string, options: { format: "markdown" }): string;
}

export function runMemoryCommand(context: CliCommandContext, dependencies: MemoryCommandDependencies): void {
  const options = parseMemoryArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  write(context.runtime.stdout, renderMemory(loadedMemory, options.format));
}

export function runMemoryImportCommand(context: CliCommandContext, dependencies: MemoryCommandDependencies): void {
  const options = parseMemoryImportArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const inputPath = resolve(context.runtimeCwd, options.input);
  const rawImport = JSON.parse(readFileSync(inputPath, "utf8"));
  const imported = importCodeDecayMemory(loadedMemory.memory, rawImport, inputPath);
  const writtenPath = options.apply ? writeCodeDecayMemory(rootDir, imported.memory) : undefined;

  write(
    context.runtime.stdout,
    renderMemoryImportResult({
      format: options.format,
      inputPath,
      writtenPath,
      result: imported
    })
  );
}

export function runMemoryLearnCommand(context: CliCommandContext, dependencies: MemoryCommandDependencies): void {
  const options = parseMemoryLearnArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const inputPath = resolve(context.runtimeCwd, options.input);
  const rawLearning = JSON.parse(readFileSync(inputPath, "utf8"));
  const learned = learnCodeDecayMemory(loadedMemory.memory, rawLearning, inputPath);
  const writtenPath = options.apply ? writeCodeDecayMemory(rootDir, learned.memory) : undefined;

  write(
    context.runtime.stdout,
    renderMemoryLearnResult({
      format: options.format,
      inputPath,
      writtenPath,
      result: learned
    })
  );
}
