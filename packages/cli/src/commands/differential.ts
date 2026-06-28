import { resolve } from "node:path";
import {
  createConfiguredCommandAdapters,
  runAdapters,
  type AdapterResult
} from "@submuxhq/codedecay-adapters";
import { loadCodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createGitWorktree, removeGitWorktree } from "@submuxhq/codedecay-git";
import { CliExit } from "../errors";
import { parseDifferentialArgs } from "../parsers/args";
import { renderDifferentialReport } from "../renderers/differential";
import type {
  CliCommandContext,
  CliRuntime,
  ConfigFormat,
  DifferentialOptions,
  DifferentialProbeResult,
  DifferentialReport,
  DifferentialSideResult,
  DifferentialStatus,
  DifferentialSummary
} from "../types";

export interface RunDifferentialCommandDependencies {
  formatGitError(error: unknown, cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): Error;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runDifferentialCommand(
  context: CliCommandContext,
  dependencies: RunDifferentialCommandDependencies
): Promise<void> {
  const options = parseDifferentialArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const refs = requireDifferentialRefs(options);
  const rootDir = dependencies.resolveRepoRoot(cwd, { base: refs.base, head: refs.head, format: "markdown" });
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  let report: DifferentialReport;

  try {
    report = await createDifferentialReport(rootDir, refs, loadedConfig);
  } catch (error: unknown) {
    throw dependencies.formatGitError(error, rootDir, { base: refs.base, head: refs.head, format: "markdown" });
  }

  dependencies.writeOutput({
    cwd,
    output: options.output,
    rendered: renderDifferentialReport(report, options.format),
    runtime: context.runtime
  });

  if (isDifferentialFailure(report.summary.status)) {
    throw new CliExit(1);
  }
}

function requireDifferentialRefs(options: DifferentialOptions): { base: string; head: string } {
  if (!options.base || !options.head) {
    throw new Error("codedecay differential requires --base <ref> and --head <ref>.");
  }

  return {
    base: options.base,
    head: options.head
  };
}

async function createDifferentialReport(
  rootDir: string,
  refs: { base: string; head: string },
  loadedConfig: LoadedCodeDecayConfig
): Promise<DifferentialReport> {
  const startedAt = Date.now();
  const configuredProbes = createConfiguredCommandAdapters(loadedConfig.config).filter((item) => item.kind === "probe");
  let baseWorktree: { path: string } | undefined;
  let headWorktree: { path: string } | undefined;

  try {
    baseWorktree = createGitWorktree({ cwd: rootDir, ref: refs.base, prefix: "base" });
    headWorktree = createGitWorktree({ cwd: rootDir, ref: refs.head, prefix: "head" });

    const results: DifferentialProbeResult[] = [];
    for (const probe of configuredProbes) {
      const baseResult = await runDifferentialSide(probe.adapter, baseWorktree.path, loadedConfig);
      const headResult = await runDifferentialSide(probe.adapter, headWorktree.path, loadedConfig);
      const differences = compareDifferentialSides(baseResult, headResult);
      const status = differentialProbeStatus(baseResult, headResult, differences);

      results.push({
        id: probe.adapter.id,
        name: probe.adapter.name,
        command: probe.command,
        status,
        differences,
        base: baseResult,
        head: headResult
      });
    }

    const report: DifferentialReport = {
      tool: "CodeDecay",
      version: CODEDECAY_VERSION,
      generatedAt: new Date().toISOString(),
      base: refs.base,
      head: refs.head,
      summary: createDifferentialSummary(results, elapsed(startedAt)),
      results
    };

    if (loadedConfig.sourcePath) {
      report.configSource = loadedConfig.sourcePath;
    }

    return report;
  } finally {
    if (headWorktree) {
      removeGitWorktree({ cwd: rootDir, path: headWorktree.path });
    }

    if (baseWorktree) {
      removeGitWorktree({ cwd: rootDir, path: baseWorktree.path });
    }
  }
}

async function runDifferentialSide(
  adapter: ReturnType<typeof createConfiguredCommandAdapters>[number]["adapter"],
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): Promise<DifferentialSideResult> {
  const [result] = await runAdapters([adapter], {
    rootDir,
    changedFiles: [],
    config: loadedConfig.config
  });

  if (!result) {
    return {
      status: "error",
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: "Adapter did not return a result."
    };
  }

  return toDifferentialSide(result);
}

function toDifferentialSide(result: AdapterResult): DifferentialSideResult {
  const side: DifferentialSideResult = {
    status: result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr
  };

  if (result.exitCode !== undefined) {
    side.exitCode = result.exitCode;
  }

  if (result.error) {
    side.error = result.error;
  }

  const structuredOutput = parseStructuredOutput(result.stdout);
  if (structuredOutput !== undefined) {
    side.structuredOutput = structuredOutput;
  }

  return side;
}

function createDifferentialSummary(results: DifferentialProbeResult[], durationMs: number): DifferentialSummary {
  const changed = results.filter((result) => result.status === "changed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const unchanged = results.filter((result) => result.status === "passed").length;

  return {
    status: differentialStatus(results, { changed, failed, skipped }),
    total: results.length,
    unchanged,
    changed,
    skipped,
    failed,
    durationMs
  };
}

function differentialStatus(
  results: DifferentialProbeResult[],
  counts: Pick<DifferentialSummary, "changed" | "failed" | "skipped">
): DifferentialStatus {
  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.changed > 0) {
    return "changed";
  }

  if (results.length === 0 || counts.skipped === results.length) {
    return "skipped";
  }

  return "passed";
}

function differentialProbeStatus(
  base: DifferentialSideResult,
  head: DifferentialSideResult,
  differences: string[]
): DifferentialStatus {
  if (isDifferentialSideInfrastructureFailure(base) || isDifferentialSideInfrastructureFailure(head)) {
    return "failed";
  }

  if (base.status === "skipped" && head.status === "skipped") {
    return "skipped";
  }

  return differences.length > 0 ? "changed" : "passed";
}

function isDifferentialSideInfrastructureFailure(side: DifferentialSideResult): boolean {
  return side.status === "error" || side.status === "timed_out";
}

function compareDifferentialSides(base: DifferentialSideResult, head: DifferentialSideResult): string[] {
  const differences: string[] = [];

  if (base.status !== head.status) {
    differences.push(`status changed from ${base.status} to ${head.status}`);
  }

  if (base.exitCode !== head.exitCode) {
    differences.push(`exit code changed from ${formatOptionalNumber(base.exitCode)} to ${formatOptionalNumber(head.exitCode)}`);
  }

  if (base.structuredOutput !== undefined || head.structuredOutput !== undefined) {
    if (stableJson(base.structuredOutput) !== stableJson(head.structuredOutput)) {
      differences.push("structured stdout changed");
    }
  } else if (normalizeOutput(base.stdout) !== normalizeOutput(head.stdout)) {
    differences.push("stdout changed");
  }

  if (normalizeOutput(base.stderr) !== normalizeOutput(head.stderr)) {
    differences.push("stderr changed");
  }

  return differences;
}

function parseStructuredOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)])
    );
  }

  return value;
}

function normalizeOutput(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "none" : String(value);
}

function isDifferentialFailure(status: DifferentialStatus): boolean {
  return status === "changed" || status === "failed";
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
