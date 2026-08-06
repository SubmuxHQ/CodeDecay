import { resolve } from "node:path";
import { analyzeMigrationSafety, renderMigrationSafetyMarkdown } from "@submuxhq/codedecay-knowledge";
import { parseMigrationArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, MigrationOptions } from "../types";

export interface RunMigrationCommandDependencies {
  resolveRepoRoot(cwd: string, options: MigrationOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runMigrationCommand(context: CliCommandContext, dependencies: RunMigrationCommandDependencies): void {
  const options = parseMigrationArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const report = analyzeMigrationSafety({
    rootDir,
    files: options.files,
    rollbackFiles: options.rollbackFiles,
    targetKind: options.targetKind,
    connectionUrl: options.connectionUrl,
    connectionHost: options.connectionHost,
    databaseUrlEnv: options.databaseUrlEnv,
    cleanupPlan: options.cleanupPlan,
    rollbackFailed: options.rollbackFailed
  });
  const rendered = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderMigrationSafetyMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
