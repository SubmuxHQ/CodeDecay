import { resolve } from "node:path";
import { parseSnapshotArgs } from "../parsers/args";
import {
  createTrendSnapshot,
  createTrendSnapshotComparison,
  loadTrendSnapshot,
  renderTrendSnapshot,
  renderTrendSnapshotComparison
} from "../renderers/snapshot";
import type { CliAnalysisContext, CliCommandContext, CliRuntime, SnapshotOptions } from "../types";

export interface SnapshotCommandDependencies {
  resolveRepoRoot(cwd: string, options: SnapshotOptions): string;
  createAnalysisContext(rootDir: string, options: SnapshotOptions): CliAnalysisContext;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export function runSnapshotCommand(context: CliCommandContext, dependencies: SnapshotCommandDependencies): void {
  const options = parseSnapshotArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const analysis = dependencies.createAnalysisContext(rootDir, options);
  const snapshot = createTrendSnapshot(analysis.report);
  const rendered = options.compare
    ? renderTrendSnapshotComparison(createTrendSnapshotComparison(snapshot, loadTrendSnapshot(resolve(context.runtimeCwd, options.compare))), options.format)
    : renderTrendSnapshot(snapshot, options.format);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered,
    runtime: context.runtime
  });
}
