import {
  createAgentTaskBundle,
  renderAgentTaskBundle
} from "@submuxhq/codedecay-agent";
import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import { matchPatternIntelligence, renderRedteamReport } from "@submuxhq/codedecay-redteam";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { createDoctorReport, renderDoctorReport } from "@submuxhq/codedecay-tool-adapters";
import type { StartMcpServerOptions } from "../server/types";
import type {
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  McpToolInput
} from "../tools/types";
import { createAnalysisContext, createMcpRedteamReport } from "./analysis/context";
import { suggestEdgeCases } from "./analysis/edge-cases";

export { createAnalysisContext, createMcpRedteamReport } from "./analysis/context";
export type { McpAnalysisContext } from "./analysis/context";

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

export function runToolRecommendationsTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const cwd = input.cwd ?? serverOptions.cwd;
  const report = createDoctorReport(cwd);

  return renderDoctorReport(report, input.format ?? "json");
}

export function runPatternSearchTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      patterns: matchPatternIntelligence(report)
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

function createReport(serverOptions: StartMcpServerOptions, input: McpToolInput): CodeDecayReport {
  return createAnalysisContext(serverOptions, input).report;
}
