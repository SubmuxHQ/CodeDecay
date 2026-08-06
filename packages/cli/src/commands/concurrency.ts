import { resolve } from "node:path";
import { analyzeConcurrencySafety, renderConcurrencySafetyMarkdown } from "@submuxhq/codedecay-knowledge";
import { parseConcurrencyArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, ConcurrencyOptions } from "../types";

export interface RunConcurrencyCommandDependencies {
  resolveRepoRoot(cwd: string, options: ConcurrencyOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runConcurrencyCommand(context: CliCommandContext, dependencies: RunConcurrencyCommandDependencies): void {
  const options = parseConcurrencyArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const report = analyzeConcurrencySafety({
    rootDir,
    experimentFile: options.experimentFile,
    surfaceFiles: options.surfaceFiles,
    targetKind: options.targetKind,
    cleanupPlan: options.cleanupPlan
  });
  const rendered = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderConcurrencySafetyMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
