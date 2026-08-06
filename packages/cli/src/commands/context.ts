import { resolve } from "node:path";
import { listRepoFiles } from "@submuxhq/codedecay-analyzer-js";
import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRequirementTrace } from "@submuxhq/codedecay-core";
import {
  createEngineeringTaskContext,
  loadImpactGraphArtifact,
  persistEngineeringTaskContext,
  renderEngineeringTaskContextMarkdown,
  startContextService,
  stopContextService,
  getOrCreateContextService,
  writeContextServiceMarker
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

export async function runContextCommand(
  context: CliCommandContext,
  dependencies: RunContextCommandDependencies
): Promise<void> {
  const options = parseContextArgs(context.args);
  if (options.serviceAction) {
    await runContextServiceCommand(context, dependencies, options);
    return;
  }

  const task = options.task?.trim();
  if (!task) {
    throw new Error('context requires --task <description>, or a service subcommand such as "serve".');
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

async function runContextServiceCommand(
  context: CliCommandContext,
  dependencies: RunContextCommandDependencies,
  options: ContextOptions
): Promise<void> {
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const action = options.serviceAction!;

  if (action === "serve") {
    const service = await startContextService(rootDir);
    const health = service.health();
    writeContextServiceMarker(rootDir, health);
    dependencies.writeOutput({
      cwd,
      output: options.output,
      rendered:
        options.format === "json"
          ? `${JSON.stringify({ status: "started", health }, null, 2)}\n`
          : renderServiceMarkdown("started", health),
      runtime: context.runtime
    });
    // Long-lived local serve: keep the process until interrupt.
    await new Promise<void>((resolvePromise) => {
      const stop = async () => {
        await stopContextService(rootDir);
        resolvePromise();
      };
      process.once("SIGINT", () => void stop());
      process.once("SIGTERM", () => void stop());
    });
    return;
  }

  if (action === "stop") {
    await stopContextService(rootDir);
    dependencies.writeOutput({
      cwd,
      output: options.output,
      rendered: options.format === "json" ? `${JSON.stringify({ status: "stopped" }, null, 2)}\n` : "## Context Service\n\nStopped.\n",
      runtime: context.runtime
    });
    return;
  }

  const service = getOrCreateContextService(rootDir, { acquireLock: action === "rebuild" || action === "reset" });
  if (action === "rebuild") {
    await service.rebuild("manual-rebuild");
  } else if (action === "reset") {
    await service.reset();
  } else if (action === "query") {
    if (service.health().cacheGeneration === 0) {
      await service.rebuild("initial");
    }
    const result = await service.query({
      waitBudgetMs: options.waitBudgetMs ?? 250,
      sessionId: options.sessionId,
      task: options.task
    });
    writeContextServiceMarker(rootDir, service.health());
    dependencies.writeOutput({
      cwd,
      output: options.output,
      rendered: `${JSON.stringify(result, null, 2)}\n`,
      runtime: context.runtime
    });
    return;
  }

  if (service.health().cacheGeneration === 0 && action === "health") {
    await service.rebuild("initial");
  }
  const health = service.health();
  writeContextServiceMarker(rootDir, health);
  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: options.format === "json" ? `${JSON.stringify(health, null, 2)}\n` : renderServiceMarkdown(action, health),
    runtime: context.runtime
  });
}

function renderServiceMarkdown(action: string, health: {
  repositoryId: string;
  freshness: string;
  treeFingerprint: string;
  cacheGeneration: number;
  indexedRevision: string;
  lastBuild?: { mode: string; durationMs: number } | undefined;
  activeSessions: number;
}): string {
  return [
    "## CodeDecay Context Service",
    "",
    `**Action:** ${action}`,
    `**Repository:** \`${health.repositoryId}\``,
    `**Freshness:** ${health.freshness}`,
    `**Revision:** \`${health.indexedRevision}\``,
    `**Tree fingerprint:** \`${health.treeFingerprint}\``,
    `**Cache generation:** ${health.cacheGeneration}`,
    `**Active sessions:** ${health.activeSessions}`,
    health.lastBuild
      ? `**Last build:** ${health.lastBuild.mode} (${health.lastBuild.durationMs}ms)`
      : "**Last build:** none",
    "",
    "Local-only. No model, network, telemetry, install, or project-command calls.",
    ""
  ].join("\n");
}
