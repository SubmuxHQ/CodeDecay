import { resolve } from "node:path";
import { analyzeResilienceSafety, renderResilienceSafetyMarkdown } from "@submuxhq/codedecay-knowledge";
import { parseResilienceArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, ResilienceOptions } from "../types";

export interface RunResilienceCommandDependencies {
  resolveRepoRoot(cwd: string, options: ResilienceOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runResilienceCommand(context: CliCommandContext, dependencies: RunResilienceCommandDependencies): void {
  const options = parseResilienceArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const report = analyzeResilienceSafety({
    rootDir,
    experimentFile: options.experimentFile,
    surfaceFiles: options.surfaceFiles,
    targetKind: options.targetKind,
    cleanupPlan: options.cleanupPlan
  });
  const rendered = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderResilienceSafetyMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
