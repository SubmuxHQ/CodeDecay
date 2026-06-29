import {
  createConfiguredCommandAdapters,
  runAdapters
} from "@submuxhq/codedecay-adapters";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import type { McpExecutionResult } from "../../execution/types";

export async function runConfiguredCommandChecks(
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
