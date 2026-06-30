import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  createAnalysisReport,
  productFailureBundlesFromProductTargetReport,
  type ProductFailureBundle
} from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import {
  applyMemoryContext,
  loadCodeDecayMemory
} from "@submuxhq/codedecay-memory";
import type {
  AgentOptions,
  AnalyzeOptions,
  CliAnalysisContext,
  LlmReviewOptions,
  RedteamOptions,
  SnapshotOptions
} from "../types";

export function createAnalysisContextForCli(
  rootDir: string,
  options: AnalyzeOptions | AgentOptions | RedteamOptions | SnapshotOptions | LlmReviewOptions
): CliAnalysisContext {
  const changedFiles = getChangedFilesForCli(rootDir, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles,
    designContract: loadedConfig.config.designContract
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const analyzerResultWithMemory = applyMemoryContext({
    memory: loadedMemory.memory,
    changedFiles,
    impactedAreas: analyzerResult.impactedAreas,
    analyzerResult
  });

  return {
    loadedMemory,
    report: createAnalysisReport({
      base: options.base,
      head: options.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory,
      productFailureBundles: loadLatestProductFailureBundles(rootDir)
    })
  };
}

export function getRepoRootForCli(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string {
  try {
    return getRepoRoot(cwd);
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, cwd, options);
  }
}

export function getChangedFilesForCli(rootDir: string, options: { base?: string | undefined; head?: string | undefined; format: string }) {
  try {
    return getGitChangedFiles({
      cwd: rootDir,
      base: options.base,
      head: options.head
    });
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, rootDir, options);
  }
}

export function formatGitErrorForCli(
  error: unknown,
  cwd: string,
  options: { base?: string | undefined; head?: string | undefined; format: string }
): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("rev-parse --show-toplevel") && message.includes("not a git repository")) {
    return new Error(`${cwd} is not a git repository. Run from a git repo or pass --cwd <repo>.`);
  }

  const unresolvedRef = findUnresolvedRef(message, options);
  if (unresolvedRef) {
    return new Error(
      `Could not resolve git ref "${unresolvedRef}". Check --base/--head and fetch the ref before running CodeDecay.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function loadLatestProductFailureBundles(rootDir: string): ProductFailureBundle[] {
  const reportPath = join(rootDir, CODEDECAY_PRODUCT_LATEST_REPORT_PATH);
  if (!existsSync(reportPath)) {
    return [];
  }

  try {
    return productFailureBundlesFromProductTargetReport(JSON.parse(readFileSync(reportPath, "utf8")));
  } catch {
    return [];
  }
}

function findUnresolvedRef(
  message: string,
  options: { base?: string | undefined; head?: string | undefined }
): string | undefined {
  for (const ref of [options.base, options.head]) {
    if (ref && message.includes(ref)) {
      return ref;
    }
  }

  return undefined;
}
