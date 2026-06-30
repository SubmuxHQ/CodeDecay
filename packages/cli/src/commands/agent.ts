import { resolve } from "node:path";
import { createAgentTaskBundle, renderAgentTaskBundle } from "@submuxhq/codedecay-agent";
import { parseAgentArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";

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
  const report = await createRedteamReportForCli(cwd, options, dependencies);
  const bundle = createAgentTaskBundle(report, {
    profile: options.profile,
    taskFilters: {
      source: options.filterSource,
      priority: options.filterPriority,
      file: options.filterFile
    }
  });

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderAgentTaskBundle(bundle, options.format),
    runtime: context.runtime
  });
}
