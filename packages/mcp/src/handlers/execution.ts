import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { getRepoRoot } from "@submuxhq/codedecay-git";
import { renderMcpExecutionReport } from "../execution/report";
import type { StartMcpServerOptions } from "../server/types";
import type { ExecuteConfiguredChecksToolInput } from "../tools/types";
import { createMcpExecutionReport } from "./execution/report";

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
