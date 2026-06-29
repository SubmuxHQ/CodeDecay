import { createConfiguredCommandAdapters, runAdapters } from "@submuxhq/codedecay-adapters";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createConfiguredToolHarnesses } from "@submuxhq/codedecay-tool-adapters";
import type { ExecutionReport, ExecutionResult, ExecutionToolAdapterResult } from "../../types";
import { createAgentProcessHarnessContextForCli } from "./agent-context";
import { createExecutionSummary } from "./summary";
import type { RunExecuteCommandDependencies } from "./types";

export async function createExecutionReport(
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

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
