import { resolve } from "node:path";
import { createAgentTaskBundle, renderAgentTaskBundle } from "@submuxhq/codedecay-agent";
import { loadCodeDecayConfig, type CodeDecayConfig, type LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import { getGitChangedFiles } from "@submuxhq/codedecay-git";
import {
  renderLoopReport,
  runCodeDecayLoop,
  type Evidence,
  type LoopCheckSnapshot,
  type LoopCheckStatus,
  type LoopCoverageSnapshot,
  type LoopMutationSnapshot,
  type LoopReport,
  type LoopSecurityToolSnapshot
} from "@submuxhq/codedecay-harness";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";
import type { RedteamReport } from "@submuxhq/codedecay-redteam";
import { CliExit } from "../errors";
import { parseLoopArgs } from "../parsers/args";
import type {
  AgentOptions,
  AnalyzeOptions,
  CliAnalysisContext,
  CliCommandContext,
  CliRuntime,
  ExecutionReport,
  ExecutionToolAdapterResult,
  RedteamOptions
} from "../types";
import { createExecutionReport } from "./execute/report";
import type { RunExecuteCommandDependencies } from "./execute/types";
import { createRedteamReportForCli, type RedteamReportDependencies } from "./redteam-report";

export interface RunLoopCommandDependencies {
  createAnalysisContext(rootDir: string, options: AgentOptions | AnalyzeOptions | RedteamOptions): CliAnalysisContext;
  resolveRepoRoot: RedteamReportDependencies["resolveRepoRoot"];
  writeOutput(input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }): void;
}

export async function runLoopCommand(
  context: CliCommandContext,
  dependencies: RunLoopCommandDependencies
): Promise<void> {
  const options = parseLoopArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = dependencies.resolveRepoRoot(cwd, {
    base: options.base,
    head: options.head,
    format: options.format
  });
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const report = await runCodeDecayLoop({
    cwd: rootDir,
    base: options.base,
    head: options.head,
    maxRounds: options.maxRounds,
    agentCommand: options.agentCommand,
    safeRiskLevel: options.safeRiskLevel,
    securityScoreThreshold: options.securityScoreThreshold,
    agentTimeoutMs: loadedConfig.config.safety.commandTimeoutMs,
    commandSafety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    },
    createRedteamReport: async () =>
      await createRedteamReportForCli(rootDir, {
        base: options.base,
        head: options.head,
        format: "json"
      }, dependencies),
    renderAgentBundle: (redteamReport) =>
      renderAgentTaskBundle(createAgentTaskBundle(redteamReport as RedteamReport, { profile: "generic" }), "markdown"),
    runConfiguredChecks: async () => await createLoopCheckSnapshot(rootDir, loadedConfig, dependencies),
    getChangedFiles: () => getGitChangedFiles({ cwd: rootDir })
  });

  dependencies.writeOutput({
    cwd: rootDir,
    output: options.output,
    rendered: renderLoopReport(report, options.format),
    runtime: context.runtime
  });

  if (shouldFail(report)) {
    throw new CliExit(1);
  }
}

async function createLoopCheckSnapshot(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  dependencies: RunExecuteCommandDependencies
): Promise<LoopCheckSnapshot> {
  if (!hasConfiguredChecks(loadedConfig.config)) {
    return {
      configured: false,
      status: "not-configured",
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      errors: 0,
      durationMs: 0,
      semgrep: emptySecurityToolSnapshot(),
      coverage: emptyCoverageSnapshot(),
      mutation: emptyMutationSnapshot(),
      note: "No configured commands, probes, or tool adapters were found."
    };
  }

  const report = await createExecutionReport(rootDir, loadedConfig, dependencies);
  const adapterEvidence = createAdapterEvidenceSnapshot(report);
  return {
    configured: true,
    status: report.summary.status,
    total: report.summary.total,
    passed: report.summary.passed,
    failed: report.summary.failed,
    skipped: report.summary.skipped,
    timedOut: report.summary.timedOut,
    errors: report.summary.errors,
    durationMs: report.summary.durationMs,
    semgrep: adapterEvidence.semgrep,
    coverage: adapterEvidence.coverage,
    mutation: adapterEvidence.mutation
  };
}

function hasConfiguredChecks(config: CodeDecayConfig): boolean {
  return (
    config.commands.test.length > 0 ||
    config.commands.build.length > 0 ||
    config.commands.start.length > 0 ||
    config.probes.length > 0 ||
    Object.values(config.toolAdapters).some((adapter) => adapter?.enabled)
  );
}

function shouldFail(report: LoopReport): boolean {
  return report.status === "unverified" ||
    report.status === "stuck" ||
    report.status === "needs-human" ||
    report.status === "agent-error";
}

function createAdapterEvidenceSnapshot(report: ExecutionReport): {
  semgrep: LoopSecurityToolSnapshot;
  coverage: LoopCoverageSnapshot;
  mutation: LoopMutationSnapshot;
} {
  return {
    semgrep: summarizeSemgrepAdapter(report.toolAdapters.find((adapter) => adapter.kind === "semgrep")),
    coverage: summarizeCoverageAdapter(report.toolAdapters.find((adapter) => adapter.kind === "coverage")),
    mutation: summarizeMutationAdapter(report.toolAdapters.find((adapter) => adapter.kind === "stryker"))
  };
}

function summarizeSemgrepAdapter(adapter: ExecutionToolAdapterResult | undefined): LoopSecurityToolSnapshot {
  if (!adapter) {
    return emptySecurityToolSnapshot();
  }

  const evidence = evidenceForAdapter(adapter, "semgrep");
  const findingCount = firstFiniteMetadataNumber(evidence, "findingCount") ?? evidence.filter((item) => item.file).length;
  const highFindingCount = evidence.filter((item) => item.file && item.severity === "high").length;
  const maxSeverity = maxRiskSeverity(evidence);
  return {
    configured: true,
    ran: adapterRan(adapter.status),
    status: adapterStatusToLoopStatus(adapter.status),
    findingCount,
    highFindingCount,
    maxSeverity
  };
}

function summarizeCoverageAdapter(adapter: ExecutionToolAdapterResult | undefined): LoopCoverageSnapshot {
  if (!adapter) {
    return emptyCoverageSnapshot();
  }

  const evidence = evidenceForAdapter(adapter, "coverage");
  const measuredLines = firstFiniteMetadataNumber(evidence, "measuredLines");
  const coveredLines = firstFiniteMetadataNumber(evidence, "coveredLines");
  const uncoveredLines = firstFiniteMetadataNumber(evidence, "uncoveredLines");
  const percent = measuredLines && measuredLines > 0 && coveredLines !== undefined
    ? roundPercent((coveredLines / measuredLines) * 100)
    : undefined;
  return {
    configured: true,
    present: measuredLines !== undefined,
    status: adapterStatusToLoopStatus(adapter.status),
    percent,
    measuredLines,
    coveredLines,
    uncoveredLines
  };
}

function summarizeMutationAdapter(adapter: ExecutionToolAdapterResult | undefined): LoopMutationSnapshot {
  if (!adapter) {
    return emptyMutationSnapshot();
  }

  const evidence = evidenceForAdapter(adapter, "stryker");
  const totalMutants = firstFiniteMetadataNumber(evidence, "totalMutants");
  const survivedMutants = firstFiniteMetadataNumber(evidence, "survivedMutants") ?? 0;
  const noCoverageMutants = firstFiniteMetadataNumber(evidence, "noCoverageMutants") ?? 0;
  const mutationScore = firstFiniteMetadataNumber(evidence, "mutationScore");
  const weakMutants = totalMutants === undefined ? undefined : survivedMutants + noCoverageMutants;
  return {
    configured: true,
    present: totalMutants !== undefined || mutationScore !== undefined,
    status: adapterStatusToLoopStatus(adapter.status),
    mutationScore,
    totalMutants,
    weakMutants
  };
}

function emptySecurityToolSnapshot(): LoopSecurityToolSnapshot {
  return {
    configured: false,
    ran: false,
    status: "not-configured",
    findingCount: 0,
    highFindingCount: 0
  };
}

function emptyCoverageSnapshot(): LoopCoverageSnapshot {
  return {
    configured: false,
    present: false,
    status: "not-configured"
  };
}

function emptyMutationSnapshot(): LoopMutationSnapshot {
  return {
    configured: false,
    present: false,
    status: "not-configured"
  };
}

function evidenceForAdapter(adapter: ExecutionToolAdapterResult, id: ConfiguredToolAdapterKind | "semgrep" | "coverage" | "stryker"): Evidence[] {
  return adapter.evidence.filter((item) => item.source.id === id || item.kind === evidenceKindForAdapter(id));
}

function evidenceKindForAdapter(id: ConfiguredToolAdapterKind | "semgrep" | "coverage" | "stryker"): Evidence["kind"] {
  if (id === "coverage") {
    return "coverage";
  }

  if (id === "stryker") {
    return "mutation";
  }

  return "static-analysis";
}

function firstFiniteMetadataNumber(evidence: Evidence[], key: string): number | undefined {
  for (const item of evidence) {
    const value = item.metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function maxRiskSeverity(evidence: Evidence[]): LoopSecurityToolSnapshot["maxSeverity"] {
  const severities = evidence.map((item) => item.severity).filter((severity) => severity !== "info");
  if (severities.includes("high")) {
    return "high";
  }

  if (severities.includes("medium")) {
    return "medium";
  }

  if (severities.includes("low")) {
    return "low";
  }

  return undefined;
}

function adapterRan(status: ExecutionToolAdapterResult["status"]): boolean {
  return status !== "skipped";
}

function adapterStatusToLoopStatus(status: ExecutionToolAdapterResult["status"]): LoopCheckStatus {
  return status;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
