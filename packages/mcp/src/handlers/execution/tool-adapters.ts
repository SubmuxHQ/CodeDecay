import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createConfiguredToolHarnesses } from "@submuxhq/codedecay-tool-adapters";
import type { McpExecutionToolAdapterResult } from "../../execution/types";
import { createAgentProcessHarnessContextForMcp } from "./agent-context";

export async function runConfiguredToolAdapterChecks(
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
