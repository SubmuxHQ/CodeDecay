import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import {
  createRevalidationReport,
  type CodeDecayReport,
  type RevalidationCurrentFile,
  type RevalidationMemorySuggestion
} from "@submuxhq/codedecay-core";
import {
  importCodeDecayMemory,
  loadCodeDecayMemory,
  writeCodeDecayMemory
} from "@submuxhq/codedecay-memory";
import { parseRevalidateArgs } from "../parsers/revalidate";
import { renderRevalidationReport } from "../renderers/revalidate";
import type { CliAnalysisContext, CliCommandContext, CliRuntime, RevalidateCliReport, RevalidateOptions } from "../types";

export interface RunRevalidateCommandDependencies {
  createAnalysisContext(rootDir: string, options: RevalidateOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export function runRevalidateCommand(
  context: CliCommandContext,
  dependencies: RunRevalidateCommandDependencies
): void {
  const options = parseRevalidateArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const inputPath = resolve(context.runtimeCwd, options.input);
  const previousReport = parsePreviousReport(inputPath);
  const { report: currentReport } = dependencies.createAnalysisContext(rootDir, options);
  const revalidation = createRevalidationReport({
    previousReport,
    currentReport,
    currentFiles: loadCurrentFiles(rootDir, previousReport),
    falsePositiveIds: options.falsePositiveIds,
    acceptedRiskIds: options.acceptedRiskIds
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const memoryImport = memoryImportFromRevalidation(revalidation.memorySuggestions);
  const memoryPreview = importCodeDecayMemory(loadedMemory.memory, memoryImport, inputPath);
  const writtenPath = options.applyMemory ? writeCodeDecayMemory(rootDir, memoryPreview.memory) : undefined;
  const report: RevalidateCliReport = {
    ...revalidation,
    memoryPreview: {
      apply: options.applyMemory,
      writtenPath,
      suggested: {
        regressions: revalidation.memorySuggestions.length
      },
      added: memoryPreview.added,
      merged: memoryPreview.merged
    }
  };

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderRevalidationReport(report, options.format),
    runtime: context.runtime
  });
}

function parsePreviousReport(inputPath: string): CodeDecayReport {
  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as Partial<CodeDecayReport>;
  if (parsed.tool !== "CodeDecay" || !Array.isArray(parsed.findings)) {
    throw new Error(`Invalid CodeDecay report at ${inputPath}. Expected JSON output from codedecay analyze.`);
  }

  return parsed as CodeDecayReport;
}

function loadCurrentFiles(rootDir: string, previousReport: CodeDecayReport): RevalidationCurrentFile[] {
  const paths = new Set<string>();
  for (const finding of previousReport.findings) {
    if (finding.file) {
      paths.add(finding.file);
    }
  }
  for (const candidate of previousReport.securityCandidates ?? []) {
    paths.add(candidate.file);
  }

  const files: RevalidationCurrentFile[] = [];
  for (const path of paths) {
    const fullPath = resolve(rootDir, path);
    if (!isInsideRoot(rootDir, fullPath)) {
      continue;
    }

    if (!existsSync(fullPath)) {
      files.push({ path, content: null });
      continue;
    }

    if (!statSync(fullPath).isFile()) {
      files.push({ path, content: null });
      continue;
    }

    files.push({ path, content: readFileSync(fullPath, "utf8") });
  }

  return files;
}

function isInsideRoot(rootDir: string, fullPath: string): boolean {
  const root = resolve(rootDir);
  return fullPath === root || fullPath.startsWith(`${root}${sep}`);
}

function memoryImportFromRevalidation(suggestions: RevalidationMemorySuggestion[]) {
  return {
    version: 1,
    regressions: suggestions.map((suggestion) => ({
      title: suggestion.title,
      description: suggestion.description,
      severity: suggestion.severity,
      files: suggestion.files,
      check: `Revalidate CodeDecay item ${suggestion.sourceItemId}`
    }))
  };
}
