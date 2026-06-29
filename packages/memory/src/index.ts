import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
  FileChange,
  ImpactedArea
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { isEmptyMemory } from "./schema";
import type {
  CodeDecayMemory,
  MemoryContextInput,
  MemoryMatcher
} from "./types";

export { importCodeDecayMemory } from "./import-memory";
export { learnCodeDecayMemory } from "./learn-memory";
export {
  createLocalMemoryProvider,
  createMemoryProviderRegistry,
  loadCodeDecayMemory,
  loadCodeDecayMemoryFromProvider,
  MemoryProviderRegistry
} from "./providers";
export { DEFAULT_CODEDECAY_MEMORY } from "./types";
export type {
  CodeDecayMemory,
  LoadedCodeDecayMemory,
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryContextInput,
  MemoryFlow,
  MemoryImportCounts,
  MemoryImportResult,
  MemoryInvariant,
  MemoryLearnResult,
  MemoryMatcher,
  MemoryProvider,
  MemoryProviderKind,
  MemoryProviderLoadOptions,
  MemoryRegression
} from "./types";

export function writeCodeDecayMemory(rootDir: string, memory: CodeDecayMemory): string {
  const directory = join(rootDir, ".codedecay");
  const sourcePath = join(directory, "memory.json");
  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return sourcePath;
}

export function applyMemoryContext(input: MemoryContextInput): AnalyzerResult {
  if (isEmptyMemory(input.memory)) {
    return input.analyzerResult;
  }

  const findings = [...input.analyzerResult.findings];
  const recommendedTests = [...input.analyzerResult.recommendedTests];

  for (const invariant of input.memory.invariants) {
    const match = firstMatchingFile(invariant, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-invariant-impacted",
      title: "Project invariant may be impacted",
      description: `Memory invariant "${invariant.name}" applies to this change. ${invariant.description}`,
      severity: invariant.severity ?? "medium",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
    recommendedTests.push(`Verify invariant: ${invariant.name}`);
  }

  for (const regression of input.memory.regressions) {
    const match = firstMatchingFile(regression, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-past-regression-area",
      title: "Past regression area changed",
      description: `Past regression "${regression.title}" may be relevant. ${regression.description}`,
      severity: regression.severity ?? "high",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
    recommendedTests.push(regression.check ? `Regression check: ${regression.check}` : `Regression check: ${regression.title}`);
  }

  for (const flow of input.memory.flows) {
    if (!matchesMemoryEntry(flow, input.changedFiles, input.impactedAreas)) {
      continue;
    }

    recommendedTests.push(`Verify flow: ${flow.name}`);
    recommendedTests.push(...(flow.checks ?? []).map((check) => `Flow check (${flow.name}): ${check}`));
  }

  for (const command of input.memory.commands) {
    if (!matchesMemoryEntry(command, input.changedFiles, input.impactedAreas)) {
      continue;
    }

    recommendedTests.push(`Run project command: ${command.name} (${command.command})`);
  }

  for (const note of input.memory.architecture) {
    const match = firstMatchingFile(note, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-architecture-note",
      title: "Architecture note applies",
      description: `${note.title}: ${note.note}`,
      severity: "low",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
  }

  return {
    ...input.analyzerResult,
    findings,
    recommendedTests: dedupeStrings(recommendedTests)
  };
}

function matchesMemoryEntry(entry: MemoryMatcher, changedFiles: FileChange[], impactedAreas: ImpactedArea[]): boolean {
  return Boolean(firstMatchingFile(entry, changedFiles, impactedAreas));
}

function firstMatchingFile(
  entry: MemoryMatcher,
  changedFiles: FileChange[],
  impactedAreas: ImpactedArea[]
): FileChange | undefined {
  const matchingAreaFiles = new Set(
    impactedAreas
      .filter((area) => entry.areas?.includes(area.kind))
      .flatMap((area) => area.files)
  );

  return changedFiles.find((file) => {
    if (matchingAreaFiles.has(file.path)) {
      return true;
    }

    return entry.files?.some((pattern) => matchesPathPattern(file.path, pattern)) ?? false;
  });
}

function matchesPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

function firstLine(change: FileChange): number | undefined {
  return change.addedLines[0]?.line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
