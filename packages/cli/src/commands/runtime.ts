import { resolve } from "node:path";
import {
  ingestRuntimeEvidence,
  loadServiceTopologyManifest,
  renderRuntimeEvidenceMarkdown
} from "@submuxhq/codedecay-knowledge";
import { parseRuntimeArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, RuntimeOptions } from "../types";

export interface RunRuntimeCommandDependencies {
  resolveRepoRoot(cwd: string, options: RuntimeOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runRuntimeCommand(context: CliCommandContext, dependencies: RunRuntimeCommandDependencies): void {
  const options = parseRuntimeArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const topology = options.topology
    ? loadServiceTopologyManifest({ rootDir, path: options.topology })
    : undefined;
  const report = ingestRuntimeEvidence({
    rootDir,
    otlpPath: options.telemetry,
    errorsPath: options.errors,
    topology,
    headRevision: options.headRevision,
    environment: options.environment
  });
  const rendered = options.format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderRuntimeEvidenceMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
