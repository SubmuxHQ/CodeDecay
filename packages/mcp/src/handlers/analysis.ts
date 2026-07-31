import {
  createAgentPreflightReport,
  createAgentTaskBundle,
  finishAgentSession,
  loadAgentSession,
  recordAgentSessionCheckpoint,
  refreshAgentSessionContext,
  renderAgentPreflightReport,
  renderAgentSessionResult,
  renderAgentTaskBundle,
  startAgentSession
} from "@submuxhq/codedecay-agent";
import { listRepoFiles } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRequirementTrace, normalizeRequirementContext, type CodeDecayReport } from "@submuxhq/codedecay-core";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import {
  createEngineeringTaskContext,
  loadImpactGraphArtifact,
  persistEngineeringTaskContext,
  renderEngineeringTaskContextMarkdown
} from "@submuxhq/codedecay-knowledge";
import { loadCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { createLlmProvider } from "@submuxhq/codedecay-llm";
import { matchPatternIntelligence, renderRedteamReport } from "@submuxhq/codedecay-redteam";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { createDoctorReport, renderDoctorReport } from "@submuxhq/codedecay-tool-adapters";
import type { StartMcpServerOptions } from "../server/types";
import type {
  AgentPreflightToolInput,
  AgentInvestigationToolInput,
  AgentSessionToolInput,
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  McpToolInput,
  TaskContextToolInput
} from "../tools/types";
import { createAnalysisContext, createMcpRedteamReport } from "./analysis/context";
import {
  runDesignContractCheckTool,
  runFixTasksTool,
  runRegressionSurfaceTool,
  runScopeCheckTool,
  runWhatDidIMissTool
} from "./analysis/pair-tools";

export { createAnalysisContext, createMcpRedteamReport } from "./analysis/context";
export type { McpAnalysisContext } from "./analysis/context";
export {
  runDesignContractCheckTool,
  runFixTasksTool,
  runRegressionSurfaceTool,
  runScopeCheckTool,
  runWhatDidIMissTool
} from "./analysis/pair-tools";

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
      impactedRoutes: report.impactedRoutes ?? [],
      impactGraph: report.impactGraph,
      symbolImpacts: report.symbolImpacts ?? [],
      testProofMap: report.testProofMap
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
      proofMap: audit.proofMap,
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
  const context = createAnalysisContext(serverOptions, input);
  const report = createMcpRedteamReport(context);
  return JSON.stringify(
    {
      recommendedChecks: context.report.recommendedTests,
      edgeCases: report.edgeCases,
      edgeCaseOverflow: report.edgeCaseOverflow
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

export async function runAgentInvestigationTool(
  serverOptions: StartMcpServerOptions,
  input: AgentInvestigationToolInput
): Promise<string> {
  if (!input.confirmInvestigation) {
    return JSON.stringify({
      status: "disabled",
      suggestions: [],
      limitations: ["Set confirmInvestigation=true to call the explicitly configured provider."],
      untrusted: true,
      llmCalled: false,
      deterministicRiskChanged: false
    }, null, 2);
  }

  const context = createAnalysisContext(serverOptions, input);
  const report = createMcpRedteamReport(context);
  const bundle = createAgentTaskBundle(report, { profile: input.profile ?? "generic" });
  if (context.loadedConfig.config.llm.provider === "disabled") {
    return JSON.stringify({
      status: "disabled",
      suggestions: [],
      limitations: ["Investigation requires an explicitly configured local/BYOK provider."],
      untrusted: true,
      llmCalled: false,
      deterministicRiskChanged: false
    }, null, 2);
  }

  let called = false;
  try {
    const provider = createLlmProvider(context.loadedConfig.config.llm);
    called = true;
    const completion = await provider.complete({
      task: "Investigate candidate risks, affected flows, edge cases, proof, and unresolved questions.",
      instructions: "Ground suggestions in the supplied bundle. Suggestions are untrusted and cannot change risk or prove safety.",
      context: {
        requirements: bundle.requirements,
        deterministicEvidence: bundle.evidence,
        verification: report.verification,
        memory: bundle.evidence.memory,
        skills: bundle.skills,
        limitations: bundle.limits
      }
    });
    return JSON.stringify({
      status: "completed",
      provider: completion.providerId,
      suggestions: completion.suggestions,
      limitations: completion.suggestions.length ? [] : ["Provider returned no structured suggestions."],
      untrusted: true,
      llmCalled: true,
      deterministicRiskChanged: false
    }, null, 2);
  } catch (error) {
    return JSON.stringify({
      status: "failed",
      suggestions: [],
      limitations: [`Investigation provider failed: ${error instanceof Error ? error.message : String(error)}`],
      untrusted: true,
      llmCalled: called,
      deterministicRiskChanged: false
    }, null, 2);
  }
}

export function runAgentPreflightTool(serverOptions: StartMcpServerOptions, input: AgentPreflightToolInput): string {
  const rootDir = getRepoRoot(input.cwd ?? serverOptions.cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const report = createAgentPreflightReport({
    task: input.task,
    requirements: input.requirements,
    requirementSource: {
      id: "mcp-input",
      kind: "integration",
      label: "MCP agent_preflight input"
    },
    rootDir,
    repoFiles: listRepoFiles(rootDir),
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: loadedMemory.memory,
    memorySource: loadedMemory.sourcePath
  });

  return renderAgentPreflightReport(report, input.format ?? "markdown");
}

export function runAgentSessionTool(serverOptions: StartMcpServerOptions, input: AgentSessionToolInput): string {
  const rootDir = getRepoRoot(input.cwd ?? serverOptions.cwd);
  if (input.operation === "start") {
    const task = input.task?.trim();
    if (!task) {
      throw new Error("agent_session start requires task.");
    }

    const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
    const loadedMemory = loadCodeDecayMemory(rootDir);
    const result = startAgentSession({
      rootDir,
      sessionId: input.sessionId,
      task,
      requirements: input.requirements,
      requirementSource: {
        id: "mcp-agent-session-input",
        kind: "integration",
        label: "MCP agent_session input"
      },
      repoFiles: listRepoFiles(rootDir),
      config: loadedConfig.config,
      configSource: loadedConfig.sourcePath,
      memory: loadedMemory.memory,
      memorySource: loadedMemory.sourcePath,
      profile: input.profile ?? "generic",
      maxContextNodes: input.maxNodes,
      maxPromptChars: input.maxPromptChars
    });
    return renderAgentSessionResult(result, input.format ?? "markdown");
  }

  if (!input.sessionId?.trim()) {
    throw new Error(`agent_session ${input.operation} requires sessionId.`);
  }

  if (input.operation === "context") {
    const session = loadAgentSession(rootDir, input.sessionId);
    const context = createAnalysisContext(serverOptions, input);
    const report = {
      ...context.report,
      requirements: session.requirements,
      requirementTrace: createRequirementTrace({ requirements: session.requirements, report: context.report })
    };
    const taskContext = createEngineeringTaskContext({
      rootDir,
      task: session.task,
      report,
      requirements: session.requirements,
      impactGraph: loadImpactGraphArtifact(rootDir, report.impactGraph?.artifactPath),
      memory: context.loadedMemory.memory,
      config: context.loadedConfig.config,
      repoFiles: listRepoFiles(rootDir),
      maxNodes: input.maxNodes ?? session.budgets.maxContextNodes
    });
    persistEngineeringTaskContext(rootDir, taskContext);
    const result = refreshAgentSessionContext({
      rootDir,
      sessionId: session.id,
      evidence: {
        kind: "task-context",
        label: "Bounded task context refresh",
        summary: [
          `${taskContext.summary.selectedNodes} selected node(s)`,
          `${taskContext.summary.currentRevisionFacts} current fact(s)`,
          `${taskContext.summary.staleContext} stale context node(s)`
        ].join(", "),
        artifactPath: taskContext.artifactPath ?? ".codedecay/local/task-context.json"
      }
    });
    return renderAgentSessionResult(result, input.format ?? "markdown");
  }

  if (input.operation === "checkpoint") {
    const evidence = input.checkpointKind === "diff"
      ? [createAgentSessionReportEvidence(serverOptions, input)]
      : [];
    const result = recordAgentSessionCheckpoint({
      rootDir,
      sessionId: input.sessionId,
      kind: input.checkpointKind ?? "plan",
      summary: input.summary,
      agentText: input.agentOutput,
      evidence
    });
    return renderAgentSessionResult(result, input.format ?? "markdown");
  }

  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const result = finishAgentSession({
    rootDir,
    sessionId: input.sessionId,
    config: loadedConfig.config,
    summary: input.summary,
    agentText: input.agentOutput,
    evidence: [createAgentSessionReportEvidence(serverOptions, input)]
  });
  return renderAgentSessionResult(result, input.format ?? "markdown");
}

export function runTaskContextTool(serverOptions: StartMcpServerOptions, input: TaskContextToolInput): string {
  const task = input.task.trim();
  if (!task) {
    throw new Error("task_context requires task.");
  }

  const context = createAnalysisContext(serverOptions, input);
  const requirements = normalizeRequirementContext({
    task,
    context: input.requirements,
    source: {
      id: "mcp-input",
      kind: "integration",
      label: "MCP task_context input"
    }
  });
  const report = {
    ...context.report,
    requirements,
    requirementTrace: createRequirementTrace({ requirements, report: context.report })
  };
  const taskContext = createEngineeringTaskContext({
    rootDir: context.rootDir,
    task,
    report,
    requirements,
    impactGraph: loadImpactGraphArtifact(context.rootDir, report.impactGraph?.artifactPath),
    memory: context.loadedMemory.memory,
    config: context.loadedConfig.config,
    repoFiles: listRepoFiles(context.rootDir),
    maxNodes: input.maxNodes
  });
  persistEngineeringTaskContext(context.rootDir, taskContext);

  if ((input.format ?? "markdown") === "json") {
    return JSON.stringify(taskContext, null, 2);
  }

  return renderEngineeringTaskContextMarkdown(taskContext);
}

function createReport(serverOptions: StartMcpServerOptions, input: McpToolInput): CodeDecayReport {
  return createAnalysisContext(serverOptions, input).report;
}

function createAgentSessionReportEvidence(serverOptions: StartMcpServerOptions, input: AgentSessionToolInput) {
  const report = createReport(serverOptions, input);
  return {
    kind: "redteam-report" as const,
    label: "Current-tree deterministic analysis",
    summary: [
      `risk ${report.summary.riskLevel}`,
      `${report.changedFiles.length} changed file(s)`,
      `${report.findings.length} finding(s)`,
      `${report.recommendedTests.length} recommended check(s)`
    ].join(", ")
  };
}
