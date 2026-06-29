import { resolve } from "node:path";
import { shouldFailForRisk } from "@submuxhq/codedecay-core";
import { renderRedteamReport } from "@submuxhq/codedecay-redteam";
import { CliExit } from "../errors";
import { parseRedteamArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime } from "../types";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";

export interface RunRedteamCommandDependencies extends RedteamReportDependencies {
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runRedteamCommand(
  context: CliCommandContext,
  dependencies: RunRedteamCommandDependencies
): Promise<void> {
  const options = parseRedteamArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const report = await createRedteamReportForCli(cwd, options, dependencies);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderRedteamReport(report, options.format),
    runtime: context.runtime
  });

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}
