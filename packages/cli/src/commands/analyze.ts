import { resolve } from "node:path";
import { shouldFailForRisk } from "@submuxhq/codedecay-core";
import { renderReport } from "@submuxhq/codedecay-report";
import { CliExit } from "../errors";
import { parseAnalyzeArgs } from "../parsers/args";
import type { AnalyzeOptions, CliAnalysisContext, CliCommandContext, CliRuntime } from "../types";

export interface RunAnalyzeCommandDependencies {
  createAnalysisContext(rootDir: string, options: AnalyzeOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export function runAnalyzeCommand(
  context: CliCommandContext,
  dependencies: RunAnalyzeCommandDependencies
): void {
  const options = parseAnalyzeArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const { report } = dependencies.createAnalysisContext(rootDir, options);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderReport(report, options.format),
    runtime: context.runtime
  });

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}
