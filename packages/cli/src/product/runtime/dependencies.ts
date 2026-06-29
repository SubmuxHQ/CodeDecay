import type { CodeDecayReport, FileChange } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { loadCodeDecayMemory, type CodeDecayMemory, type MemoryMatcher } from "@submuxhq/codedecay-memory";
import {
  escapeRegExp,
  normalizeProductPriorityPath,
  type ProductGeneratedTestDependencies
} from "../generated-tests";
import type { CliAnalysisContext } from "../../types";

export interface ProductRuntimeDependencies {
  createAnalysisContext(rootDir: string): CliAnalysisContext;
  getChangedFiles(rootDir: string): FileChange[];
}

export function createProductGeneratedTestDependencies(dependencies: ProductRuntimeDependencies): ProductGeneratedTestDependencies {
  return {
    findPrioritizedProductPaths: (rootDir) => findPrioritizedProductPaths(rootDir, dependencies),
    findImpactedProductFiles: (rootDir) => findImpactedProductFiles(rootDir, dependencies)
  };
}

function findImpactedProductPaths(rootDir: string, dependencies: ProductRuntimeDependencies): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = dependencies.createAnalysisContext(repoRoot);
    return new Set((analysis.report.impactedRoutes ?? []).map((route) => route.route));
  } catch {
    return new Set();
  }
}

function findPrioritizedProductPaths(rootDir: string, dependencies: ProductRuntimeDependencies): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = dependencies.createAnalysisContext(repoRoot);
    const paths = new Set((analysis.report.impactedRoutes ?? []).map((route) => normalizeProductPriorityPath(route.route)));
    const changedFiles = analysis.report.changedFiles;
    const impactedAreaKinds = new Set(analysis.report.impactedAreas.map((area) => area.kind));
    const memory = loadCodeDecayMemory(repoRoot).memory;

    for (const regression of memory.regressions) {
      for (const path of regression.productPaths ?? []) {
        paths.add(normalizeProductPriorityPath(path));
      }
    }

    for (const entry of productMemoryEntries(memory)) {
      if (!memoryEntryMatchesProductScope(entry, changedFiles, impactedAreaKinds)) {
        continue;
      }

      for (const path of entry.productPaths ?? []) {
        paths.add(normalizeProductPriorityPath(path));
      }
    }

    return paths;
  } catch {
    return findImpactedProductPaths(rootDir, dependencies);
  }
}

function productMemoryEntries(memory: CodeDecayMemory): MemoryMatcher[] {
  return [...memory.flows, ...memory.invariants, ...memory.architecture, ...memory.commands];
}

function memoryEntryMatchesProductScope(
  entry: MemoryMatcher,
  changedFiles: CodeDecayReport["changedFiles"],
  impactedAreaKinds: Set<CodeDecayReport["impactedAreas"][number]["kind"]>
): boolean {
  if (entry.areas?.some((area) => impactedAreaKinds.has(area))) {
    return true;
  }

  return changedFiles.some((file) => entry.files?.some((pattern) => matchesProductMemoryPathPattern(file.path, pattern)));
}

function matchesProductMemoryPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

function findImpactedProductFiles(rootDir: string, dependencies: ProductRuntimeDependencies): string[] {
  try {
    const repoRoot = getRepoRoot(rootDir);
    return dependencies.getChangedFiles(repoRoot).map((change) => change.path).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}
