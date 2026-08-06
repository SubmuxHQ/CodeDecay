import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import {
  appendLearningEventProposal,
  applyLearningEventOperation,
  detectLearningConflicts,
  importCodeDecayMemory,
  learnCodeDecayMemory,
  loadCodeDecayMemory,
  writeCodeDecayMemory,
  type MemoryLearningEventInput,
  type MemoryLearningConflict
} from "@submuxhq/codedecay-memory";
import { write } from "../io";
import {
  parseMemoryArgs,
  parseMemoryImportArgs,
  parseMemoryLearnArgs,
  parseMemoryLearningArgs,
  parseMemorySetupArgs
} from "../parsers/args";
import {
  renderMemory,
  renderMemoryImportResult,
  renderMemoryLearnResult,
  renderMemoryLearningResult
} from "../renderers/memory";
import {
  createMemorySetupResult,
  renderMemorySetupResult
} from "../memory/setup";
import type { CliCommandContext } from "../types";

export interface MemoryCommandDependencies {
  resolveRepoRoot(cwd: string, options: { format: "markdown" }): string;
}

export function runMemoryCommand(context: CliCommandContext, dependencies: MemoryCommandDependencies): void {
  if (context.args[0] === "setup") {
    runMemorySetupCommand({
      ...context,
      args: context.args.slice(1)
    }, dependencies);
    return;
  }

  if (context.args[0] === "learning") {
    runMemoryLearningCommand({
      ...context,
      args: context.args.slice(1)
    }, dependencies);
    return;
  }

  const options = parseMemoryArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  write(context.runtime.stdout, renderMemory(loadedMemory, options.format));
}

export function runMemorySetupCommand(context: CliCommandContext, dependencies: MemoryCommandDependencies): void {
  const options = parseMemorySetupArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const result = createMemorySetupResult(rootDir, options);
  write(context.runtime.stdout, renderMemorySetupResult(result, options.format));
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
  const rawLearning = parseMemoryLearningInput(inputPath);
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

export function runMemoryLearningCommand(context: CliCommandContext, dependencies: MemoryCommandDependencies): void {
  const options = parseMemoryLearningArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: "markdown" });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const timestamp = new Date().toISOString();
  let memory = loadedMemory.memory;
  let eventId = options.eventId;
  let conflicts: MemoryLearningConflict[] = detectLearningConflicts(memory);

  if (options.action === "propose") {
    const inputPath = resolve(context.runtimeCwd, options.input!);
    const proposal = JSON.parse(readFileSync(inputPath, "utf8")) as MemoryLearningEventInput;
    // Proposals always land as reviewStatus=proposed; approve/reject/etc. are explicit ops.
    const appended = appendLearningEventProposal(memory, {
      ...proposal,
      timestamp: proposal.timestamp ?? timestamp,
      creator: proposal.creator ?? options.actor
    });
    memory = appended.memory;
    eventId = appended.event.id;
    conflicts = appended.conflicts;
  } else {
    memory = applyLearningEventOperation(memory, {
      eventId: options.eventId!,
      action: options.action,
      actor: options.actor,
      timestamp,
      reason: options.reason,
      evidenceIds: options.evidenceIds
    });
    conflicts = detectLearningConflicts(memory);
  }

  const writtenPath = options.apply ? writeCodeDecayMemory(rootDir, memory) : undefined;
  write(
    context.runtime.stdout,
    renderMemoryLearningResult({
      format: options.format,
      action: options.action,
      eventId: eventId!,
      writtenPath,
      conflicts,
      applied: options.apply
    })
  );
}

function parseMemoryLearningInput(inputPath: string): unknown {
  const raw = readFileSync(inputPath, "utf8");
  if (isMarkdownPath(inputPath)) {
    return {
      incidentMarkdowns: [
        {
          path: inputPath,
          markdown: raw
        }
      ]
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid memory-learn input at ${inputPath}: ${message}`);
  }

  return expandIncidentMarkdownFiles(parsed, inputPath);
}

function expandIncidentMarkdownFiles(value: unknown, inputPath: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.incidentMarkdownFiles)) {
    return value;
  }

  const incidentMarkdowns = [
    ...(Array.isArray(object.incidentMarkdowns) ? object.incidentMarkdowns : []),
    ...object.incidentMarkdownFiles
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((filePath) => {
        const resolved = resolve(dirname(inputPath), filePath);
        return {
          path: filePath,
          markdown: readFileSync(resolved, "utf8")
        };
      })
  ];

  return {
    ...object,
    incidentMarkdowns
  };
}

function isMarkdownPath(inputPath: string): boolean {
  return [".md", ".markdown"].includes(extname(inputPath).toLowerCase());
}
