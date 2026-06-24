import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { createAnalysisReport } from "@submuxhq/codedecay-core";
import { getGitChangedFiles } from "@submuxhq/codedecay-git";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";
import type { AnalyzePullRequestOptions, AnalyzePullRequestResult } from "./types.js";

export function analyzePullRequest(options: AnalyzePullRequestOptions): AnalyzePullRequestResult {
  const changedFiles = getGitChangedFiles({
    cwd: options.cwd,
    base: options.base,
    head: options.head
  });

  const analyzerResult = analyzeJsProject({
    rootDir: options.cwd,
    changedFiles
  });

  const report = createAnalysisReport({
    base: options.base,
    head: options.head,
    changedFiles,
    analyzerResult
  });

  return {
    report,
    markdown: renderMarkdownReport(report)
  };
}
