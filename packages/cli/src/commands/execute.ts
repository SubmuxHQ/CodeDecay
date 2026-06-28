import { resolve } from "node:path";
import {
  createConfiguredCommandAdapters,
  runAdapters,
  type AdapterStatus
} from "@submuxhq/codedecay-adapters";
import {
  createAgentTaskBundle,
  isAgentProfileId,
  renderAgentTaskBundle,
  type AgentProfileId,
  type AgentTaskBundleFormat
} from "@submuxhq/codedecay-agent";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createRedteamReport } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createConfiguredToolHarnesses } from "@submuxhq/codedecay-tool-adapters";
import { CliExit } from "../errors";
import { parseExecuteArgs } from "../parsers/args";
import { renderExecutionReport } from "../renderers/execute";
import type {
  AnalyzeOptions,
  CliAnalysisContext,
  CliCommandContext,
  CliRuntime,
  ExecutionReport,
  ExecutionResult,
  ExecutionSummary,
  ExecutionToolAdapterResult
} from "../types";

export interface RunExecuteCommandDependencies {
  createAnalysisContext(rootDir: string, options: AnalyzeOptions): CliAnalysisContext;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runExecuteCommand(
  context: CliCommandContext,
  dependencies: RunExecuteCommandDependencies
): Promise<void> {
  const options = parseExecuteArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  const report = await createExecutionReport(cwd, loadedConfig, dependencies);
  const rendered = renderExecutionReport(report, options.format);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered,
    runtime: context.runtime
  });

  if (isExecutionFailure(report.summary.status)) {
    throw new CliExit(1);
  }
}

async function createExecutionReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  dependencies: RunExecuteCommandDependencies
): Promise<ExecutionReport> {
  const startedAt = Date.now();
  const configuredAdapters = createConfiguredCommandAdapters(loadedConfig.config);
  const adapterResults: ExecutionResult[] = [];

  for (const configured of configuredAdapters) {
    const [result] = await runAdapters([configured.adapter], {
      rootDir,
      changedFiles: [],
      config: loadedConfig.config
    });

    if (!result) {
      continue;
    }

    adapterResults.push({
      ...result,
      kind: configured.kind,
      command: configured.command
    });
  }

  const toolAdapterResults = await runConfiguredToolAdapters(rootDir, loadedConfig, dependencies);

  const report: ExecutionReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: createExecutionSummary(adapterResults, toolAdapterResults, elapsed(startedAt)),
    results: adapterResults,
    toolAdapters: toolAdapterResults
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  return report;
}

async function runConfiguredToolAdapters(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  dependencies: RunExecuteCommandDependencies
): Promise<ExecutionToolAdapterResult[]> {
  const configuredToolAdapters = createConfiguredToolHarnesses(loadedConfig.config);
  const results: ExecutionToolAdapterResult[] = [];

  for (const configured of configuredToolAdapters) {
    const plan = await configured.harness.plan({
      cwd: rootDir,
      evidence: []
    });
    const agentContext =
      configured.kind === "agent-process"
        ? createAgentProcessHarnessContextForCli(rootDir, loadedConfig, configured.context, dependencies)
        : configured.context;
    const context =
      configured.timeoutMs === undefined
        ? { cwd: rootDir, context: agentContext }
        : { cwd: rootDir, timeoutMs: configured.timeoutMs, context: agentContext };
    const result = await configured.harness.run(plan, context);
    const mapped: ExecutionToolAdapterResult = {
      kind: configured.kind,
      name: configured.name,
      command: configured.command,
      status: result.status,
      durationMs: result.durationMs,
      summary: result.summary ?? result.failure?.message ?? `${configured.name} produced ${result.evidence.length} evidence item(s).`,
      evidence: result.evidence
    };

    if (configured.timeoutMs !== undefined) {
      mapped.timeoutMs = configured.timeoutMs;
    }

    if (result.failure) {
      mapped.failure = result.failure;
    }

    results.push(mapped);
  }

  return results;
}

function createAgentProcessHarnessContextForCli(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  configuredContext: Record<string, unknown> | undefined,
  dependencies: RunExecuteCommandDependencies
): Record<string, unknown> {
  const profile = agentProfileFromContext(configuredContext?.agentProfile);
  const bundleFormat = agentBundleFormatFromContext(configuredContext?.agentBundleFormat);
  const analysis = dependencies.createAnalysisContext(rootDir, { format: "json" });
  const report = createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: analysis.loadedMemory.memory,
    memorySource: analysis.loadedMemory.sourcePath,
    skills: loadCodeDecaySkills({ cwd: rootDir })
  });
  const bundle = createAgentTaskBundle(report, { profile });

  return {
    ...configuredContext,
    agentProfile: profile,
    agentBundleFormat: bundleFormat,
    agentBundle: renderAgentTaskBundle(bundle, bundleFormat)
  };
}

function agentProfileFromContext(value: unknown): AgentProfileId {
  return typeof value === "string" && isAgentProfileId(value) ? value : "generic";
}

function agentBundleFormatFromContext(value: unknown): AgentTaskBundleFormat {
  return value === "json" || value === "markdown" ? value : "markdown";
}

function createExecutionSummary(
  results: ExecutionResult[],
  toolAdapters: ExecutionToolAdapterResult[],
  durationMs: number
): ExecutionSummary {
  const allResults = [...results, ...toolAdapters];
  const passed = countStatus(allResults, "passed");
  const failed = countStatus(allResults, "failed");
  const skipped = countStatus(allResults, "skipped");
  const timedOut = countStatus(allResults, "timed_out");
  const errors = countStatus(allResults, "error");

  return {
    status: executionStatus(allResults, { failed, timedOut, errors }),
    total: allResults.length,
    passed,
    failed,
    skipped,
    timedOut,
    errors,
    durationMs
  };
}

function executionStatus(
  results: Array<{ status: AdapterStatus }>,
  counts: Pick<ExecutionSummary, "failed" | "timedOut" | "errors">
): AdapterStatus {
  if (counts.errors > 0) {
    return "error";
  }

  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function countStatus(results: Array<{ status: AdapterStatus }>, status: AdapterStatus): number {
  return results.filter((result) => result.status === status).length;
}

function isExecutionFailure(status: AdapterStatus): boolean {
  return status === "failed" || status === "timed_out" || status === "error";
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
