import { resolve } from "node:path";
import {
  buildServiceTopologyReport,
  renderServiceTopologyReportMarkdown
} from "@submuxhq/codedecay-knowledge";
import { parseTopologyArgs } from "../parsers/args";
import type { CliCommandContext, CliRuntime, TopologyOptions } from "../types";

export interface RunTopologyCommandDependencies {
  resolveRepoRoot(cwd: string, options: TopologyOptions): string;
  writeOutput(input: { cwd: string; output?: string | undefined; rendered: string; runtime: CliRuntime }): void;
}

export function runTopologyCommand(context: CliCommandContext, dependencies: RunTopologyCommandDependencies): void {
  const options = parseTopologyArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const report = buildServiceTopologyReport({
    rootDir,
    manifest: options.manifest,
    openapi: options.openapi,
    asyncapi: options.asyncapi,
    localGraph: options.localGraph,
    changedNodeIds: options.changed,
    invalidatePaths: options.invalidate,
    repositoryId: options.repositoryId,
    revision: options.revision,
    producerServiceId: options.producerServiceId,
    publisherServiceId: options.publisherServiceId,
    subscriberServiceId: options.subscriberServiceId
  });
  const rendered =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderServiceTopologyReportMarkdown(report);
  dependencies.writeOutput({ cwd: rootDir, output: options.output, rendered, runtime: context.runtime });
}
