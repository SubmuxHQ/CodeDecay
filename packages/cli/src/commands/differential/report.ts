import { createConfiguredCommandAdapters } from "@submuxhq/codedecay-adapters";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createGitWorktree, removeGitWorktree } from "@submuxhq/codedecay-git";
import type { DifferentialProbeResult, DifferentialReport, DifferentialStatus, DifferentialSummary } from "../../types";
import { compareDifferentialSides, differentialProbeStatus, runDifferentialSide } from "./side-results";

export async function createDifferentialReport(
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

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
