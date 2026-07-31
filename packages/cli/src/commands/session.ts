import { resolve } from "node:path";
import {
  finishAgentSession,
  loadAgentSession,
  recordAgentSessionCheckpoint,
  refreshAgentSessionContext,
  renderAgentSessionResult,
  startAgentSession,
  type AgentSessionEvidenceInput
} from "@submuxhq/codedecay-agent";
import { listRepoFiles } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRequirementTrace } from "@submuxhq/codedecay-core";
import {
  createEngineeringTaskContext,
  loadImpactGraphArtifact,
  persistEngineeringTaskContext
} from "@submuxhq/codedecay-knowledge";
import { loadCodeDecayMemory } from "@submuxhq/codedecay-memory";
import { parseSessionArgs } from "../parsers/args";
import { loadRequirementArtifact } from "../requirements/load";
import type {
  AnalyzeOptions,
  CliAnalysisContext,
  CliCommandContext,
  CliRuntime,
  SessionOptions
} from "../types";

export interface RunSessionCommandDependencies {
  createAnalysisContext(rootDir: string, options: AnalyzeOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { format: string }): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export function runSessionCommand(
  context: CliCommandContext,
  dependencies: RunSessionCommandDependencies
): void {
  const options = parseSessionArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, { format: options.format });
  const result = runSessionOperation(rootDir, options, dependencies);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderAgentSessionResult(result, options.format),
    runtime: context.runtime
  });
}

function runSessionOperation(
  rootDir: string,
  options: SessionOptions,
  dependencies: RunSessionCommandDependencies
) {
  if (options.command === "start") {
    const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
    const loadedMemory = loadCodeDecayMemory(rootDir);
    const loadedRequirements = options.requirements
      ? loadRequirementArtifact(rootDir, options.requirements)
      : undefined;

    return startAgentSession({
      rootDir,
      sessionId: options.session,
      task: options.task ?? "",
      requirements: loadedRequirements?.context,
      requirementSource: loadedRequirements?.source,
      repoFiles: listRepoFiles(rootDir),
      config: loadedConfig.config,
      configSource: loadedConfig.sourcePath,
      memory: loadedMemory.memory,
      memorySource: loadedMemory.sourcePath,
      profile: options.profile,
      maxContextNodes: options.maxNodes,
      maxPromptChars: options.maxChars
    });
  }

  if (options.command === "context") {
    const session = loadAgentSession(rootDir, options.session ?? "");
    const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
    const { report, loadedMemory } = dependencies.createAnalysisContext(rootDir, analysisOptions(options));
    const reportWithRequirements = {
      ...report,
      requirements: session.requirements,
      requirementTrace: createRequirementTrace({ requirements: session.requirements, report })
    };
    const taskContext = createEngineeringTaskContext({
      rootDir,
      task: session.task,
      report: reportWithRequirements,
      requirements: session.requirements,
      impactGraph: loadImpactGraphArtifact(rootDir, report.impactGraph?.artifactPath),
      memory: loadedMemory.memory,
      config: loadedConfig.config,
      repoFiles: listRepoFiles(rootDir),
      maxNodes: options.maxNodes ?? session.budgets.maxContextNodes
    });
    persistEngineeringTaskContext(rootDir, taskContext);

    return refreshAgentSessionContext({
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
  }

  if (options.command === "checkpoint") {
    const evidence = options.checkpointKind === "diff"
      ? [createReportEvidence(rootDir, options, dependencies)]
      : [];
    return recordAgentSessionCheckpoint({
      rootDir,
      sessionId: options.session ?? "",
      kind: options.checkpointKind ?? "plan",
      summary: options.summary,
      agentText: options.agentOutput,
      evidence
    });
  }

  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const evidence = [createReportEvidence(rootDir, options, dependencies)];
  return finishAgentSession({
    rootDir,
    sessionId: options.session ?? "",
    config: loadedConfig.config,
    summary: options.summary,
    agentText: options.agentOutput,
    evidence
  });
}

function createReportEvidence(
  rootDir: string,
  options: SessionOptions,
  dependencies: RunSessionCommandDependencies
): AgentSessionEvidenceInput {
  const { report } = dependencies.createAnalysisContext(rootDir, analysisOptions(options));
  return {
    kind: "redteam-report",
    label: "Current-tree deterministic analysis",
    summary: [
      `risk ${report.summary.riskLevel}`,
      `${report.changedFiles.length} changed file(s)`,
      `${report.findings.length} finding(s)`,
      `${report.recommendedTests.length} recommended check(s)`
    ].join(", ")
  };
}

function analysisOptions(options: SessionOptions): AnalyzeOptions {
  return {
    cwd: options.cwd,
    format: options.format,
    output: options.output
  };
}
