import { resolve } from "node:path";
import { renderBenchmarkReport } from "../benchmark/render";
import { runBenchmark } from "../benchmark/run";
import { parseBenchmarkArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";

export interface RunBenchmarkCommandDependencies extends RedteamReportDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runBenchmarkCommand(
  context: CliCommandContext,
  dependencies: RunBenchmarkCommandDependencies
): Promise<void> {
  const options = parseBenchmarkArgs(context.args);
  const cwd = resolve(context.runtimeCwd, ".");
  const report = await runBenchmark(options, {
    createRedteamReport: (repoRoot) =>
      createRedteamReportForCli(repoRoot, { format: "json" }, dependencies)
  });

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderBenchmarkReport(report, options.format),
    runtime: context.runtime
  });
}
