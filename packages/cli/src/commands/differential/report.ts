import { createConfiguredCommandAdapters } from "@submuxhq/codedecay-adapters";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createGitWorktree, removeGitWorktree } from "@submuxhq/codedecay-git";
import type { DifferentialApiContractResult, DifferentialProbeResult, DifferentialReport, DifferentialStatus, DifferentialSummary } from "../../types";
import { compareApiContracts } from "./api-contracts";
import { createDifferentialRunId, writeDifferentialProbeArtifacts } from "./artifacts";
import { compareDifferentialSides, differentialProbeStatus, runDifferentialSide } from "./side-results";

export async function createDifferentialReport(
  rootDir: string,
  refs: { base: string; head: string },
  loadedConfig: LoadedCodeDecayConfig
): Promise<DifferentialReport> {
  const startedAt = Date.now();
  const runId = createDifferentialRunId(startedAt);
  const configuredProbes = createConfiguredCommandAdapters(loadedConfig.config).filter((item) => item.kind === "probe");
  let baseWorktree: { path: string } | undefined;
  let headWorktree: { path: string } | undefined;

  try {
    baseWorktree = createGitWorktree({ cwd: rootDir, ref: refs.base, prefix: "base" });
    headWorktree = createGitWorktree({ cwd: rootDir, ref: refs.head, prefix: "head" });

    const results: DifferentialProbeResult[] = [];
    const apiContracts = compareApiContracts({
      baseWorktree: baseWorktree.path,
      headWorktree: headWorktree.path,
      refs,
      config: loadedConfig.config
    });
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
        rerunCommand: `npx codedecay differential --base ${refs.base} --head ${refs.head} --format markdown`,
        artifacts: writeDifferentialProbeArtifacts({
          rootDir,
          runId,
          probeId: probe.adapter.id,
          base: baseResult,
          head: headResult
        }),
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
      summary: createDifferentialSummary(results, apiContracts, elapsed(startedAt)),
      results,
      apiContracts
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

function createDifferentialSummary(
  results: DifferentialProbeResult[],
  apiContracts: DifferentialApiContractResult[],
  durationMs: number
): DifferentialSummary {
  const changed = results.filter((result) => result.status === "changed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const unchanged = results.filter((result) => result.status === "passed").length;
  const apiContractSummary = createApiContractSummary(apiContracts);

  return {
    status: differentialStatus(results, apiContracts, { changed, failed, skipped }),
    total: results.length + apiContracts.length,
    unchanged: unchanged + apiContractSummary.passed,
    changed: changed + apiContractSummary.changed,
    skipped,
    failed: failed + apiContractSummary.failed,
    durationMs,
    apiContracts: apiContractSummary
  };
}

function differentialStatus(
  results: DifferentialProbeResult[],
  apiContracts: DifferentialApiContractResult[],
  counts: Pick<DifferentialSummary, "changed" | "failed" | "skipped">
): DifferentialStatus {
  if (counts.failed > 0 || apiContracts.some((result) => result.status === "failed")) {
    return "failed";
  }

  if (counts.changed > 0 || apiContracts.some((result) => result.status === "changed")) {
    return "changed";
  }

  if (results.length === 0 && apiContracts.length === 0) {
    return "skipped";
  }

  if (results.length > 0 && counts.skipped === results.length && apiContracts.length === 0) {
    return "skipped";
  }

  return "passed";
}

function createApiContractSummary(apiContracts: DifferentialApiContractResult[]): DifferentialSummary["apiContracts"] {
  return {
    total: apiContracts.length,
    passed: apiContracts.filter((result) => result.status === "passed").length,
    changed: apiContracts.filter((result) => result.status === "changed").length,
    failed: apiContracts.filter((result) => result.status === "failed").length,
    breakingChanges: apiContracts.reduce((sum, result) => sum + result.breakingChanges.length, 0),
    nonBreakingChanges: apiContracts.reduce((sum, result) => sum + result.nonBreakingChanges.length, 0)
  };
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
