import {
  createAgentTaskBundle,
  renderAgentTaskBundle
} from "@submuxhq/codedecay-agent";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  createAnalysisReport,
  type CodeDecayReport
} from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import { applyMemoryContext, loadCodeDecayMemory, type LoadedCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createRedteamReport, renderRedteamReport, type RedteamReport } from "@submuxhq/codedecay-redteam";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { loadLatestProductRun } from "../product/latest-run";
import type { StartMcpServerOptions } from "../server/types";
import type {
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  McpToolInput
} from "../tools/types";

export interface McpAnalysisContext {
  rootDir: string;
  loadedConfig: LoadedCodeDecayConfig;
  loadedMemory: LoadedCodeDecayMemory;
  report: CodeDecayReport;
}

export function runAnalyzePrTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const report = createReport(serverOptions, input);
  if (input.format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderMarkdownReport(report);
}

export function runImpactMapTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      changedFiles: report.changedFiles,
      impactedAreas: report.impactedAreas,
      impactedRoutes: report.impactedRoutes ?? []
    },
    null,
    2
  );
}

export function runAuditTestsTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  const audit = createTestProofAudit(report);
  const findings = [...audit.missingTestFindings, ...audit.weakTestFindings];

  return JSON.stringify(
    {
      status: audit.status,
      summary: audit.summary,
      changedSourceFiles: audit.changedSourceFiles,
      changedTestFiles: audit.changedTestFiles,
      missingTestFindings: audit.missingTestFindings,
      weakTestFindings: audit.weakTestFindings,
      findings,
      recommendedChecks: audit.recommendedChecks
    },
    null,
    2
  );
}

export function runSuggestEdgeCasesTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      recommendedChecks: report.recommendedTests,
      edgeCases: suggestEdgeCases(report)
    },
    null,
    2
  );
}

export function runRedteamReportTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const context = createAnalysisContext(serverOptions, input);
  const report = createMcpRedteamReport(context);

  return renderRedteamReport(report, input.format ?? "markdown");
}

export function runAgentTaskBundleTool(serverOptions: StartMcpServerOptions, input: AgentTaskBundleToolInput): string {
  const context = createAnalysisContext(serverOptions, input);
  const report = createMcpRedteamReport(context);
  const bundle = createAgentTaskBundle(report, { profile: input.profile ?? "generic" });

  return renderAgentTaskBundle(bundle, input.format ?? "markdown");
}

export function createAnalysisContext(serverOptions: StartMcpServerOptions, input: McpToolInput): McpAnalysisContext {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const changedFiles = getGitChangedFiles({
    cwd: rootDir,
    base: input.base,
    head: input.head
  });

  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const analyzerResultWithMemory = applyMemoryContext({
    memory: loadedMemory.memory,
    changedFiles,
    impactedAreas: analyzerResult.impactedAreas,
    analyzerResult
  });

  return {
    rootDir,
    loadedConfig,
    loadedMemory,
    report: createAnalysisReport({
      base: input.base,
      head: input.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory,
      productFailureBundles: loadLatestProductRun(rootDir).failures
    })
  };
}

export function createMcpRedteamReport(context: McpAnalysisContext): RedteamReport {
  return createRedteamReport({
    analysisReport: context.report,
    config: context.loadedConfig.config,
    configSource: context.loadedConfig.sourcePath,
    memory: context.loadedMemory.memory,
    memorySource: context.loadedMemory.sourcePath,
    skills: loadCodeDecaySkills({ cwd: context.rootDir })
  });
}

function createReport(serverOptions: StartMcpServerOptions, input: McpToolInput): CodeDecayReport {
  return createAnalysisContext(serverOptions, input).report;
}

function suggestEdgeCases(report: CodeDecayReport): string[] {
  const suggestions = new Set<string>();

  for (const area of report.impactedAreas) {
    if (area.kind === "api") {
      suggestions.add("Exercise the real API route with malformed, missing, and boundary-value payloads.");
      suggestions.add("Check auth, validation, and downstream consumers through the route, not only helper functions.");
    }

    if (area.kind === "auth") {
      suggestions.add("Check missing, expired, malformed, and privilege-escalation credentials.");
      suggestions.add("Verify denied paths fail closed and do not silently return privileged defaults.");
    }

    if (area.kind === "database") {
      suggestions.add("Check migration/schema compatibility with existing records and null/default values.");
      suggestions.add("Verify read and write paths that depend on changed schema fields.");
    }

    if (area.kind === "ui") {
      suggestions.add("Check loading, empty, error, and permission-denied UI states.");
      suggestions.add("Exercise the real route through browser or component integration tests.");
    }

    if (area.kind === "config") {
      suggestions.add("Run build/start commands in a clean environment to catch config or packaging regressions.");
      suggestions.add("Verify CI and production-like environment variables still resolve correctly.");
    }
  }

  for (const recommendation of report.recommendedTests) {
    suggestions.add(recommendation);
  }

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}
