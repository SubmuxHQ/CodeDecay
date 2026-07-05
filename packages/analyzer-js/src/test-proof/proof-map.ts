import { basename } from "node:path";
import {
  dedupeStrings,
  type ChangedPathTestProofEntry,
  type ChangedPathTestProofMap,
  type ChangedPathTestProofStatus,
  type ChangedSourceCoverage,
  type FileChange,
  type SymbolImpact,
  type TestEvidenceSummary
} from "@submuxhq/codedecay-core";
import { readChangedFile } from "../tests/line-matches";
import { createSourceProfile, referencesSourceProfile, type SourceProfile } from "../tests/source-profiles";
import { MOCK_PATTERN } from "../tests/weak-patterns";

interface CreateChangedPathTestProofMapInput {
  rootDir: string;
  changedSourceFiles: FileChange[];
  changedTestFiles: FileChange[];
  testEvidence: TestEvidenceSummary;
  symbolImpacts: SymbolImpact[];
}

interface ProofTarget {
  file: string;
  symbol?: string | undefined;
  line?: number | undefined;
  routeFiles: string[];
  likelyTests: string[];
}

export function createChangedPathTestProofMap(input: CreateChangedPathTestProofMapInput): ChangedPathTestProofMap {
  const coverageByFile = new Map(input.testEvidence.changedSources.map((entry) => [entry.path, entry]));
  const sourceProfiles = new Map(input.changedSourceFiles.map((change) => [change.path, createSourceProfile(change)]));
  const changedTestContent = new Map(input.changedTestFiles.map((change) => [change.path, readTestContent(input.rootDir, change)]));
  const entries = createProofTargets(input.changedSourceFiles, input.symbolImpacts).map((target) =>
    createProofEntry({
      rootDir: input.rootDir,
      target,
      coverage: coverageByFile.get(target.file),
      profile: sourceProfiles.get(target.file),
      changedTestContent
    })
  );

  return {
    summary: summarizeProofEntries(entries),
    entries
  };
}

function createProofEntry(input: {
  rootDir: string;
  target: ProofTarget;
  coverage: ChangedSourceCoverage | undefined;
  profile: SourceProfile | undefined;
  changedTestContent: Map<string, string>;
}): ChangedPathTestProofEntry {
  const staticReferences = findStaticReferences({
    target: input.target,
    profile: input.profile,
    changedTestContent: input.changedTestContent
  });
  const weakenedByMocks = findMockedReferences({
    rootDir: input.rootDir,
    target: input.target,
    profile: input.profile,
    staticReferences,
    changedTestContent: input.changedTestContent
  });
  const status = classifyProofStatus(input.coverage, staticReferences, weakenedByMocks);

  return {
    file: input.target.file,
    symbol: input.target.symbol,
    line: input.target.line,
    status,
    evidence: evidenceForStatus(status),
    proof: proofGradeForStatus(status),
    runtimeCoverage: input.coverage,
    staticReferences,
    routeFiles: input.target.routeFiles,
    weakenedByMocks,
    reasons: reasonsForStatus(status, input.coverage, staticReferences, weakenedByMocks),
    repairTask: repairTaskForStatus(status, input.target, staticReferences, weakenedByMocks)
  };
}

function createProofTargets(changedSourceFiles: FileChange[], symbolImpacts: SymbolImpact[]): ProofTarget[] {
  const impactsByFile = new Map<string, SymbolImpact[]>();
  for (const impact of symbolImpacts) {
    impactsByFile.set(impact.file, [...(impactsByFile.get(impact.file) ?? []), impact]);
  }

  const targets = changedSourceFiles.flatMap<ProofTarget>((change) => {
    const impacts = impactsByFile.get(change.path) ?? [];
    if (impacts.length === 0) {
      return [
        {
          file: change.path,
          symbol: undefined,
          line: change.addedLines[0]?.line,
          routeFiles: [],
          likelyTests: []
        }
      ];
    }

    return impacts.map((impact) => ({
      file: impact.file,
      symbol: impact.symbol,
      line: impact.line,
      routeFiles: [...impact.routeFiles],
      likelyTests: [...impact.likelyTests]
    }));
  });

  return dedupeProofTargets(targets).sort((left, right) => targetLabel(left).localeCompare(targetLabel(right)));
}

function findStaticReferences(input: {
  target: ProofTarget;
  profile: SourceProfile | undefined;
  changedTestContent: Map<string, string>;
}): string[] {
  const references = new Set(input.target.likelyTests);
  if (!input.profile) {
    return [...references].sort((left, right) => left.localeCompare(right));
  }

  for (const [testPath, content] of input.changedTestContent) {
    if (referencesSourceProfile(content, input.profile) || referencesSymbol(content, input.target.symbol)) {
      references.add(testPath);
    }
  }

  return [...references].sort((left, right) => left.localeCompare(right));
}

function findMockedReferences(input: {
  rootDir: string;
  target: ProofTarget;
  profile: SourceProfile | undefined;
  staticReferences: string[];
  changedTestContent: Map<string, string>;
}): string[] {
  if (!input.profile && !input.target.symbol) {
    return [];
  }

  return input.staticReferences
    .filter((testPath) => testMocksTarget(readTestContentByPath(input.rootDir, testPath, input.changedTestContent), input.profile, input.target.symbol))
    .sort((left, right) => left.localeCompare(right));
}

function classifyProofStatus(
  coverage: ChangedSourceCoverage | undefined,
  staticReferences: string[],
  weakenedByMocks: string[]
): ChangedPathTestProofStatus {
  if (weakenedByMocks.length > 0) {
    return "weakened_by_mocking";
  }

  if (coverage?.status === "covered") {
    return "proven_by_runtime_coverage";
  }

  if (staticReferences.length > 0) {
    return "referenced_only_statically";
  }

  return "unproven";
}

function evidenceForStatus(status: ChangedPathTestProofStatus): ChangedPathTestProofEntry["evidence"] {
  switch (status) {
    case "proven_by_runtime_coverage":
      return "runtime-coverage";
    case "referenced_only_statically":
      return "static-reference";
    case "weakened_by_mocking":
      return "weak-mock";
    case "unproven":
      return "missing-proof";
  }
}

function proofGradeForStatus(status: ChangedPathTestProofStatus): ChangedPathTestProofEntry["proof"] {
  return status === "unproven" ? "heuristic" : "deterministic";
}

function reasonsForStatus(
  status: ChangedPathTestProofStatus,
  coverage: ChangedSourceCoverage | undefined,
  staticReferences: string[],
  weakenedByMocks: string[]
): string[] {
  if (status === "proven_by_runtime_coverage" && coverage) {
    const covered = coverage.coveredLines.length > 0 ? coverage.coveredLines.join(", ") : "changed lines";
    return [`Runtime coverage executed ${covered} from ${coverage.sourcePaths.join(", ") || "available coverage artifacts"}.`];
  }

  if (status === "weakened_by_mocking") {
    return [`Static test references mock the changed boundary in ${weakenedByMocks.join(", ")}.`];
  }

  if (status === "referenced_only_statically") {
    return [`Referenced by ${staticReferences.join(", ")}, but no runtime coverage artifact proves changed lines executed.`];
  }

  if (coverage?.status === "partial") {
    return [`Runtime coverage only partially executed changed lines; uncovered lines: ${coverage.uncoveredLines.join(", ")}.`];
  }

  if (coverage?.status === "not_covered") {
    return ["Runtime coverage measured the changed file but executed none of the changed lines."];
  }

  return ["No runtime coverage or static test reference was found for this changed path."];
}

function repairTaskForStatus(status: ChangedPathTestProofStatus, target: ProofTarget, staticReferences: string[], weakenedByMocks: string[]): string {
  const label = targetLabel(target);
  const route = target.routeFiles[0];

  if (status === "proven_by_runtime_coverage") {
    return `Keep or rerun runtime coverage that executes ${label}.`;
  }

  if (status === "weakened_by_mocking") {
    return `Add an integration test that reaches ${label} without mocking ${mockedBoundaryName(target, weakenedByMocks)}.`;
  }

  if (status === "referenced_only_statically") {
    return `Strengthen ${staticReferences[0]} so it executes ${label} with assertions; static import alone is not proof.`;
  }

  if (route) {
    return `Add an API-level test that reaches ${route} -> ${label} without mocking the changed boundary.`;
  }

  return `Add an integration test that reaches ${label} without mocking the changed boundary.`;
}

function testMocksTarget(content: string, profile: SourceProfile | undefined, symbol: string | undefined): boolean {
  const mockLines = content.split(/\r?\n/).filter((line) => MOCK_PATTERN.test(line));
  return mockLines.some((line) => (profile ? referencesSourceProfile(line, profile) : false) || referencesSymbol(line, symbol));
}

function referencesSymbol(content: string, symbol: string | undefined): boolean {
  return symbol !== undefined && new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(content);
}

function readTestContent(rootDir: string, change: FileChange): string {
  return readChangedFile(rootDir, change.path) ?? change.addedLines.map((line) => line.content).join("\n");
}

function readTestContentByPath(rootDir: string, testPath: string, changedTestContent: Map<string, string>): string {
  return changedTestContent.get(testPath) ?? readChangedFile(rootDir, testPath) ?? "";
}

function summarizeProofEntries(entries: ChangedPathTestProofEntry[]): ChangedPathTestProofMap["summary"] {
  return {
    total: entries.length,
    provenByRuntimeCoverage: countStatus(entries, "proven_by_runtime_coverage"),
    referencedOnlyStatically: countStatus(entries, "referenced_only_statically"),
    weakenedByMocking: countStatus(entries, "weakened_by_mocking"),
    unproven: countStatus(entries, "unproven")
  };
}

function countStatus(entries: ChangedPathTestProofEntry[], status: ChangedPathTestProofStatus): number {
  return entries.filter((entry) => entry.status === status).length;
}

function dedupeProofTargets(targets: ProofTarget[]): ProofTarget[] {
  const byKey = new Map<string, ProofTarget>();
  for (const target of targets) {
    const key = `${target.file}\u0000${target.symbol ?? ""}`;
    const current = byKey.get(key);
    byKey.set(key, {
      file: target.file,
      symbol: target.symbol,
      line: target.line ?? current?.line,
      routeFiles: dedupeStrings([...(current?.routeFiles ?? []), ...target.routeFiles]),
      likelyTests: dedupeStrings([...(current?.likelyTests ?? []), ...target.likelyTests])
    });
  }

  return [...byKey.values()];
}

function targetLabel(target: Pick<ProofTarget, "file" | "symbol">): string {
  return target.symbol ? `${target.file}#${target.symbol}` : target.file;
}

function mockedBoundaryName(target: ProofTarget, weakenedByMocks: string[]): string {
  return target.symbol ?? basename(target.file) ?? weakenedByMocks[0] ?? "the changed boundary";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
