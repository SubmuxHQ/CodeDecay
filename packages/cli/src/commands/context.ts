import { resolve } from "node:path";
import { listRepoFiles } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRequirementTrace } from "@submuxhq/codedecay-core";
import {
  createEngineeringTaskContext,
  loadImpactGraphArtifact,
  persistEngineeringTaskContext,
  renderEngineeringTaskContextMarkdown
} from "@submuxhq/codedecay-knowledge";
import { parseContextArgs } from "../parsers/args";
import { loadNormalizedRequirementContext } from "../requirements/context";
import type { CliAnalysisContext, CliCommandContext, CliRuntime, ContextOptions } from "../types";

export interface RunContextCommandDependencies {
  createAnalysisContext(rootDir: string, options: ContextOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export function runContextCommand(
  context: CliCommandContext,
  dependencies: RunContextCommandDependencies
): void {
  const options = parseContextArgs(context.args);
  const task = options.task?.trim();
  if (!task) {
    throw new Error("context requires --task <description>.");
  }

  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const { report: analysisReport, loadedMemory } = dependencies.createAnalysisContext(rootDir, options);
  const requirements = loadNormalizedRequirementContext(rootDir, options.requirements, task);
  const report = requirements
    ? {
        ...analysisReport,
        requirements,
        requirementTrace: createRequirementTrace({ requirements, report: analysisReport })
      }
    : {
        ...analysisReport,
        requirements: analysisReport.requirements
      };
  const impactGraph = loadImpactGraphArtifact(rootDir, report.impactGraph?.artifactPath);
  const taskContext = createEngineeringTaskContext({
    rootDir,
    task,
    report,
    requirements,
    impactGraph,
    memory: loadedMemory.memory,
    config: loadedConfig.config,
    repoFiles: listRepoFiles(rootDir),
    maxNodes: options.maxNodes
  });
  persistEngineeringTaskContext(rootDir, taskContext);

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: options.format === "json"
      ? `${JSON.stringify(taskContext, null, 2)}\n`
      : renderEngineeringTaskContextMarkdown(taskContext),
    runtime: context.runtime
  });
}
