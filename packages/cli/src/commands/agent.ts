import { resolve } from "node:path";
import { parseAgentArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { createAgentWorkflow } from "./agent-workflow";
import type { RedteamReportDependencies } from "./redteam-report";

export interface RunAgentCommandDependencies extends RedteamReportDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runAgentCommand(
  context: CliCommandContext,
  dependencies: RunAgentCommandDependencies
): Promise<void> {
  const options = parseAgentArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const workflow = await createAgentWorkflow(cwd, options, dependencies);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: workflow.rendered,
    runtime: context.runtime
  });
}
