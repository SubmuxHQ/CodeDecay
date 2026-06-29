import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  createBaseExecutionReport,
  createExecutionSummary,
  elapsed
} from "../../execution/report";
import { createExecutionSafety } from "../../execution/safety";
import type { McpExecutionReport } from "../../execution/types";
import { runConfiguredCommandChecks } from "./commands";
import { runConfiguredToolAdapterChecks } from "./tool-adapters";

export async function createMcpExecutionReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  confirmExecution: boolean
): Promise<McpExecutionReport> {
  const startedAt = Date.now();
  const safety = createExecutionSafety(loadedConfig, confirmExecution);

  if (!confirmExecution) {
    return createBaseExecutionReport({
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
