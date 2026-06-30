import type {
  DesignContract,
  DesignScopeFence,
  FileChange,
  Finding,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";
import { firstMatchingFile, type MemoryMatcher } from "@submuxhq/codedecay-memory";
import type { RedteamFixTask, RedteamReport } from "@submuxhq/codedecay-redteam";
import type {
  DesignContractCheckToolInput,
  FixTasksToolInput,
  RegressionSurfaceToolInput,
  ScopeCheckToolInput,
  WhatDidIMissToolInput
} from "../../tools/types";
import type { StartMcpServerOptions } from "../../server/types";
import { createAnalysisContext, createMcpRedteamReport, type McpAnalysisContext } from "./context";

interface PairToolSafety {
  commandsExecuted: false;
  llmCalled: false;
  telemetrySent: false;
  cloudDependency: false;
}

interface ResolvedScopeFence {
  id: string;
  name: string;
  allowedFiles: string[];
  allowedAreas: ImpactedArea["kind"][];
  severity: RiskLevel;
  message?: string | undefined;
}

interface ScopeViolation {
  file: string;
  line?: number | undefined;
  areas: ImpactedArea["kind"][];
  ruleId: "inline-scope-fence" | "contract-scope-fence" | "contract-scope-fence-missing";
  severity: RiskLevel;
  message: string;
}

const SAFETY: PairToolSafety = {
  commandsExecuted: false,
  llmCalled: false,
  telemetrySent: false,
  cloudDependency: false
};

export function runScopeCheckTool(serverOptions: StartMcpServerOptions, input: ScopeCheckToolInput): string {
  const context = createAnalysisContext(serverOptions, input);
  const fence = resolveScopeFence(context.loadedConfig.config.designContract, input);
  const missingFence = input.fence ?? context.loadedConfig.config.designContract?.activeScopeFence;
  const violations = fence
    ? checkScopeFence(context.report.changedFiles, context.report.impactedAreas, fence)
    : missingFence
      ? [missingScopeFenceViolation(missingFence)]
      : [];
  const contractFindings = contractFindingsFrom(context.report);

  return JSON.stringify(
    {
      status: scopeStatus(fence, missingFence, violations),
      task: input.task,
      fence: fence ? { id: fence.id, name: fence.name, allowedFiles: fence.allowedFiles, allowedAreas: fence.allowedAreas } : undefined,
      changedFiles: context.report.changedFiles.map((file) => file.path),
      violations,
      contractFindings,
      safety: SAFETY
    },
    null,
    2
  );
}

export function runDesignContractCheckTool(
  serverOptions: StartMcpServerOptions,
  input: DesignContractCheckToolInput
): string {
  const context = createAnalysisContext(serverOptions, input);
  const findings = contractFindingsFrom(context.report);

  return JSON.stringify(
    {
      status: context.loadedConfig.config.designContract ? (findings.length > 0 ? "fail" : "pass") : "not_configured",
      configSource: context.loadedConfig.designContractSourcePath ?? context.loadedConfig.sourcePath,
      findings,
      safety: SAFETY
    },
    null,
    2
  );
}

export function runFixTasksTool(serverOptions: StartMcpServerOptions, input: FixTasksToolInput): string {
  const report = createPairRedteamReport(serverOptions, input);
  const tasks = filterFixTasks(report.fixTasks, input);

  return JSON.stringify(
    {
      filters: {
        source: input.source,
        priority: input.priority,
        file: input.file
      },
      totalTasks: report.fixTasks.length,
      matchedTasks: tasks.length,
      tasks,
      safety: report.safety
    },
    null,
    2
  );
}

export function runWhatDidIMissTool(serverOptions: StartMcpServerOptions, input: WhatDidIMissToolInput): string {
  const report = createPairRedteamReport(serverOptions, input);
  const contractFindings = contractFindingsFrom(report.analysis);
  const gaps = {
    missingTestFindings: report.testAudit.missingTestFindings,
    weakTestFindings: report.weakTestFindings,
    contractFindings,
    edgeCases: report.edgeCases,
    impactedAreas: report.analysis.impactedAreas,
    impactedRoutes: report.analysis.impactedRoutes ?? [],
    productFailureBundles: report.analysis.productFailureBundles ?? []
  };
  const totalGaps =
    gaps.missingTestFindings.length +
    gaps.weakTestFindings.length +
    gaps.contractFindings.length +
    gaps.edgeCases.length +
    gaps.impactedRoutes.length +
    gaps.productFailureBundles.length;

  return JSON.stringify(
    {
      status: totalGaps > 0 ? "gaps_found" : "clean",
      summary: {
        missingTests: gaps.missingTestFindings.length,
        weakTests: gaps.weakTestFindings.length,
        contractViolations: gaps.contractFindings.length,
        edgeCases: gaps.edgeCases.length,
        impactedRoutes: gaps.impactedRoutes.length,
        productFailures: gaps.productFailureBundles.length
      },
      gaps,
      recommendedChecks: report.analysis.recommendedTests,
      safety: report.safety
    },
    null,
    2
  );
}

export function runRegressionSurfaceTool(
  serverOptions: StartMcpServerOptions,
  input: RegressionSurfaceToolInput
): string {
  const context = createAnalysisContext(serverOptions, input);
  const memory = context.loadedMemory.memory;

  const invariants = memory.invariants
    .map((invariant) => withMemoryMatch(invariant, context))
    .filter((entry) => entry.matchingFile);
  const regressions = memory.regressions
    .map((regression) => withMemoryMatch(regression, context))
    .filter((entry) => entry.matchingFile);
  const flows = memory.flows
    .map((flow) => withMemoryMatch(flow, context))
    .filter((entry) => entry.matchingFile);
  const architecture = memory.architecture
    .map((note) => withMemoryMatch(note, context))
    .filter((entry) => entry.matchingFile);
  const commands = memory.commands
    .map((command) => withMemoryMatch(command, context))
    .filter((entry) => entry.matchingFile);

  return JSON.stringify(
    {
      status: invariants.length + regressions.length > 0 ? "regression_surface_found" : "no_regression_surface",
      sourcePath: context.loadedMemory.sourcePath,
      surfaces: {
        invariants,
        regressions,
        flows,
        architecture,
        commands
      },
      recommendedChecks: [
        ...regressions.flatMap((entry) => (entry.item.check ? [entry.item.check] : [])),
        ...flows.flatMap((entry) => entry.item.checks ?? []),
        ...commands.map((entry) => entry.item.command)
      ],
      safety: SAFETY
    },
    null,
    2
  );
}

function createPairRedteamReport(serverOptions: StartMcpServerOptions, input: RegressionSurfaceToolInput): RedteamReport {
  return createMcpRedteamReport(createAnalysisContext(serverOptions, input));
}

function contractFindingsFrom(report: { findings: Finding[] }): Finding[] {
  return report.findings.filter((finding) => finding.ruleId.startsWith("contract-"));
}

function resolveScopeFence(contract: DesignContract | undefined, input: ScopeCheckToolInput): ResolvedScopeFence | undefined {
  if (input.files?.length || input.areas?.length) {
    return {
      id: input.fence ?? input.task ?? "inline",
      name: input.task ?? input.fence ?? "Inline scope fence",
      allowedFiles: input.files ?? [],
      allowedAreas: input.areas ?? [],
      severity: "high"
    };
  }

  const fenceId = input.fence ?? contract?.activeScopeFence;
  if (!fenceId) {
    return undefined;
  }

  const fence = contract?.scopeFences?.find((candidate) => candidate.id === fenceId);
  return fence ? normalizeFence(fence) : undefined;
}

function normalizeFence(fence: DesignScopeFence): ResolvedScopeFence {
  return {
    id: fence.id,
    name: fence.name ?? fence.id,
    allowedFiles: fence.allowedFiles ?? fence.files ?? [],
    allowedAreas: fence.allowedAreas ?? fence.areas ?? [],
    severity: fence.severity ?? "high",
    message: fence.message
  };
}

function checkScopeFence(
  changedFiles: FileChange[],
  impactedAreas: ImpactedArea[],
  fence: ResolvedScopeFence
): ScopeViolation[] {
  return changedFiles
    .filter((file) => file.status !== "deleted")
    .map((file) => ({ file, areas: areaKindsForFile(file.path, impactedAreas) }))
    .filter(({ file, areas }) => !matchesScope(file.path, areas, fence))
    .map(({ file, areas }) => ({
      file: file.path,
      line: firstChangedLine(file),
      areas,
      ruleId: fence.id === "inline" ? "inline-scope-fence" : "contract-scope-fence",
      severity: fence.severity,
      message: fence.message ?? `${file.path} is outside scope fence "${fence.id}".`
    }));
}

function missingScopeFenceViolation(fenceId: string): ScopeViolation {
  return {
    file: "",
    areas: [],
    ruleId: "contract-scope-fence-missing",
    severity: "high",
    message: `Scope fence "${fenceId}" was requested but was not found in the design contract.`
  };
}

function scopeStatus(
  fence: ResolvedScopeFence | undefined,
  missingFence: string | undefined,
  violations: ScopeViolation[]
): "in_scope" | "out_of_scope" | "missing_scope_fence" | "no_scope_fence" {
  if (!fence && missingFence) {
    return "missing_scope_fence";
  }

  if (!fence) {
    return "no_scope_fence";
  }

  return violations.length > 0 ? "out_of_scope" : "in_scope";
}

function filterFixTasks(tasks: RedteamFixTask[], input: FixTasksToolInput): RedteamFixTask[] {
  return tasks.filter((task) => {
    if (input.source && task.source !== input.source) {
      return false;
    }

    if (input.priority && task.priority !== input.priority) {
      return false;
    }

    if (input.file && !(task.file === input.file || task.file?.includes(input.file))) {
      return false;
    }

    return true;
  });
}

function withMemoryMatch<T extends MemoryMatcher>(item: T, context: McpAnalysisContext): { item: T; matchingFile?: string | undefined } {
  return {
    item,
    matchingFile: firstMatchingFile(item, context.report.changedFiles, context.report.impactedAreas)?.path
  };
}

function areaKindsForFile(path: string, impactedAreas: ImpactedArea[]): ImpactedArea["kind"][] {
  return impactedAreas
    .filter((area) => area.files.includes(path))
    .map((area) => area.kind)
    .sort((left, right) => left.localeCompare(right));
}

function matchesScope(path: string, areas: ImpactedArea["kind"][], fence: ResolvedScopeFence): boolean {
  return (
    fence.allowedFiles.some((pattern) => matchesPathPattern(path, pattern)) ||
    fence.allowedAreas.some((area) => areas.includes(area))
  );
}

function matchesPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

function firstChangedLine(change: FileChange): number | undefined {
  return change.addedLines[0]?.line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
