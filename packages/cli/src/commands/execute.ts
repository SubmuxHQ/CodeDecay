import { resolve } from "node:path";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CliExit } from "../errors";
import { parseExecuteArgs } from "../parsers/args";
import { renderExecutionReport } from "../renderers/execute";
import type { CliCommandContext } from "../types";
import { createExecutionReport } from "./execute/report";
import { isExecutionFailure } from "./execute/summary";
import type { RunExecuteCommandDependencies } from "./execute/types";

export type { RunExecuteCommandDependencies } from "./execute/types";

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
