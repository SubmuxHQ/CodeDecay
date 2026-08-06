import { resolve } from "node:path";
import { analyzeStateSpaceSafety, renderStateSpaceSafetyMarkdown } from "@submuxhq/codedecay-knowledge";
import { parseStateSpaceArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, StateSpaceOptions } from "../types";

export interface RunStateSpaceCommandDependencies {
  resolveRepoRoot(cwd: string, options: StateSpaceOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runStateSpaceCommand(context: CliCommandContext, dependencies: RunStateSpaceCommandDependencies): void {
  const options = parseStateSpaceArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const report = analyzeStateSpaceSafety({
    rootDir,
    experimentFile: options.experimentFile,
    surfaceFiles: options.surfaceFiles,
    targetKind: options.targetKind,
    cleanupPlan: options.cleanupPlan
  });
  const rendered = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderStateSpaceSafetyMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
