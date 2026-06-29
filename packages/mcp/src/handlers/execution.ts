import {
  createConfiguredCommandAdapters,
  runAdapters,
} from "@submuxhq/codedecay-adapters";
import {
  createAgentTaskBundle,
  isAgentProfileId,
  renderAgentTaskBundle,
  type AgentProfileId,
  type AgentTaskBundleFormat
} from "@submuxhq/codedecay-agent";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { createRedteamReport } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import { createConfiguredToolHarnesses } from "@submuxhq/codedecay-tool-adapters";
import { createAnalysisContext } from "./analysis";
import {
  createBaseExecutionReport,
  createExecutionSummary,
  elapsed,
  renderMcpExecutionReport
} from "../execution/report";
import { createExecutionSafety } from "../execution/safety";
import type { McpExecutionReport, McpExecutionResult, McpExecutionToolAdapterResult } from "../execution/types";
import type { StartMcpServerOptions } from "../server/types";
import type { ExecuteConfiguredChecksToolInput } from "../tools/types";

export async function runExecuteConfiguredChecksTool(
  serverOptions: StartMcpServerOptions,
  input: ExecuteConfiguredChecksToolInput
): Promise<string> {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const report = await createMcpExecutionReport(rootDir, loadedConfig, Boolean(input.confirmExecution));

  return renderMcpExecutionReport(report, input.format ?? "markdown");
}

async function createMcpExecutionReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  confirmExecution: boolean
): Promise<McpExecutionReport> {
  const startedAt = Date.now();
  const safety = createExecutionSafety(loadedConfig, confirmExecution);

  if (!confirmExecution) {
    const report = createBaseExecutionReport({
      loadedConfig,
      executed: false,
      safety,
      summary: {
        status: "not_confirmed",
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        timedOut: 0,
        errors: 0,
        durationMs: elapsed(startedAt)
      },
      results: [],
      toolAdapters: []
    });

    return report;
  }

  const results = await runConfiguredCommandChecks(rootDir, loadedConfig);
  const toolAdapters = await runConfiguredToolAdapterChecks(rootDir, loadedConfig);

  return createBaseExecutionReport({
    loadedConfig,
    executed: true,
    safety,
    summary: createExecutionSummary(results, toolAdapters, elapsed(startedAt)),
    results,
    toolAdapters
  });
}

async function runConfiguredCommandChecks(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<McpExecutionResult[]> {
  const configuredAdapters = createConfiguredCommandAdapters(loadedConfig.config);
  const results: McpExecutionResult[] = [];

  for (const configured of configuredAdapters) {
    const [result] = await runAdapters([configured.adapter], {
      rootDir,
      changedFiles: [],
      config: loadedConfig.config
    });

    if (!result) {
      continue;
    }

    results.push({
      ...result,
      kind: configured.kind,
      command: configured.command
    });
  }

  return results;
}

async function runConfiguredToolAdapterChecks(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<McpExecutionToolAdapterResult[]> {
  const configuredToolAdapters = createConfiguredToolHarnesses(loadedConfig.config);
  const results: McpExecutionToolAdapterResult[] = [];

  for (const configured of configuredToolAdapters) {
    const plan = await configured.harness.plan({
      cwd: rootDir,
      evidence: []
    });
    const agentContext =
      configured.kind === "agent-process"
        ? createAgentProcessHarnessContextForMcp(rootDir, loadedConfig, configured.context)
        : configured.context;
    const context =
      configured.timeoutMs === undefined
        ? { cwd: rootDir, context: agentContext }
        : { cwd: rootDir, timeoutMs: configured.timeoutMs, context: agentContext };
    const result = await configured.harness.run(plan, context);
    const mapped: McpExecutionToolAdapterResult = {
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

function createAgentProcessHarnessContextForMcp(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  configuredContext: Record<string, unknown> | undefined
): Record<string, unknown> {
  const profile = agentProfileFromContext(configuredContext?.agentProfile);
  const bundleFormat = agentBundleFormatFromContext(configuredContext?.agentBundleFormat);
  const context = createAnalysisContext({ cwd: rootDir }, { cwd: rootDir });
  const report = createRedteamReport({
    analysisReport: context.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: context.loadedMemory.memory,
    memorySource: context.loadedMemory.sourcePath,
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
