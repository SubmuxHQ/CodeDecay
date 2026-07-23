import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { normalizeRequirementContext } from "@submuxhq/codedecay-core";
import { createRedteamReport, type RedteamExecutionStatus, type RedteamVerificationSummary } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type { AgentOptions, AnalyzeOptions, CliAnalysisContext, CliRuntime, RedteamOptions } from "../types";
import { loadConfiguredRedteamMemory } from "../memory/configured-providers";
import { loadRequirementArtifact } from "../requirements/load";
import type { DifferentialApiContractResult, DifferentialProbeArtifacts, DifferentialProbeResult, DifferentialReport, DifferentialSideResult, ExecutionReport, ExecutionResult, ExecutionToolAdapterResult } from "../types";
import { configuredOpenApiContractPaths } from "./differential/api-contracts";
import { createDifferentialReport } from "./differential/report";
import { createExecutionReport } from "./execute/report";
import type { RunExecuteCommandDependencies } from "./execute/types";
import { createRedteamInvestigation } from "./redteam-investigation";

export interface RedteamReportDependencies {
  createAnalysisContext(rootDir: string, options: AgentOptions | AnalyzeOptions | RedteamOptions): CliAnalysisContext;
  resolveRepoRoot(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string;
  writeOutput?: ((input: {
    cwd: string;
    output?: string | undefined;
    rendered: string;
    runtime: CliRuntime;
  }) => void) | undefined;
}

export async function createRedteamReportForCli(
  cwd: string,
  options: AgentOptions | RedteamOptions,
  dependencies: RedteamReportDependencies
) {
  const rootDir = dependencies.resolveRepoRoot(cwd, options);
  const loadedConfig = loadCodeDecayConfig({ cwd: rootDir });
  const analysis = dependencies.createAnalysisContext(rootDir, options);
  const memoryContext = await loadConfiguredRedteamMemory({
    rootDir,
    localMemory: analysis.loadedMemory,
    memoryProviders: loadedConfig.config.memoryProviders
  });
  const loadedSkills = loadCodeDecaySkills({ cwd: rootDir });
  const loadedRequirements = "requirements" in options && options.requirements
    ? loadRequirementArtifact(rootDir, options.requirements)
    : undefined;
  const requirements = loadedRequirements
    ? normalizeRequirementContext({
        task: requirementTask(options, loadedRequirements.context),
        context: loadedRequirements.context,
        source: loadedRequirements.source
      })
    : undefined;
  const verification = "withChecks" in options && options.withChecks
    ? verificationFromExecutionReport(
        await createExecutionReport(rootDir, loadedConfig, executionDependencies(dependencies)),
        await maybeCreateDifferentialReport(rootDir, options, loadedConfig)
      )
    : undefined;
  const investigation = "investigate" in options && options.investigate
    ? await createRedteamInvestigation({
        phase: "post-diff",
        llmConfig: loadedConfig.config.llm,
        analysisReport: analysis.report,
        requirements,
        verification,
        limitations: [
          "Agent suggestions are untrusted and cannot change deterministic risk or prove merge safety."
        ],
        memory: memoryContext.memory,
        memorySource: memoryContext.sourcePath,
        skills: loadedSkills
      })
    : undefined;

  return createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: memoryContext.memory,
    memorySource: memoryContext.sourcePath,
    memoryProviderSources: memoryContext.providerSources,
    skills: loadedSkills,
    requirements,
    investigation,
    verification
  });
}

function requirementTask(
  options: AgentOptions | RedteamOptions,
  context: ReturnType<typeof loadRequirementArtifact>["context"]
): string {
  const explicitTask = "task" in options ? options.task?.trim() : undefined;
  if (explicitTask) {
    return explicitTask;
  }
  if (typeof context.task === "string") {
    return context.task;
  }
  if (context.task?.text) {
    return context.task.text;
  }
  throw new Error("agent --requirements requires --task <description> or a task in the requirements artifact.");
}

function executionDependencies(dependencies: RedteamReportDependencies): RunExecuteCommandDependencies {
  return {
    createAnalysisContext: dependencies.createAnalysisContext,
    writeOutput: dependencies.writeOutput ?? (() => {
      // createExecutionReport only needs writeOutput when an execution path renders nested output.
    })
  };
}

async function maybeCreateDifferentialReport(
  rootDir: string,
  options: AgentOptions | RedteamOptions,
  loadedConfig: ReturnType<typeof loadCodeDecayConfig>
): Promise<DifferentialReport | undefined> {
  const hasDifferentialInput =
    loadedConfig.config.probes.length > 0 ||
    configuredOpenApiContractPaths(loadedConfig.config).length > 0;
  if (!("withChecks" in options) || !options.withChecks || !options.base || !options.head || !hasDifferentialInput) {
    return undefined;
  }

  return createDifferentialReport(rootDir, { base: options.base, head: options.head }, loadedConfig);
}

function verificationFromExecutionReport(
  report: ExecutionReport,
  differentialReport: DifferentialReport | undefined
): RedteamVerificationSummary {
  const checks = [
    ...report.results.map(verificationCheckFromCommandResult),
    ...report.toolAdapters.map(verificationCheckFromToolAdapterResult),
    ...(differentialReport?.results.map(verificationCheckFromDifferentialResult) ?? []),
    ...(differentialReport?.apiContracts.map(verificationCheckFromApiContractResult) ?? [])
  ];
  const summary = verificationCounts(checks, report.summary.durationMs + (differentialReport?.summary.durationMs ?? 0));

  return {
    status: verificationStatus(report, differentialReport, summary),
    commandsExecuted: checks.some((check) => check.kind !== "api-contract" && didExecute(check.status)),
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    blocked: summary.blocked,
    timedOut: summary.timedOut,
    errors: summary.errors,
    durationMs: summary.durationMs,
    checks,
    notes: verificationNotes(report, differentialReport)
  };
}

function verificationStatus(
  report: ExecutionReport,
  differentialReport: DifferentialReport | undefined,
  summary: Pick<RedteamVerificationSummary, "total" | "passed" | "failed" | "skipped" | "blocked" | "timedOut" | "errors">
): RedteamVerificationSummary["status"] {
  if (summary.errors > 0 || summary.timedOut > 0 || summary.failed > 0 || differentialReport?.summary.status === "changed") {
    return "failed";
  }

  if (summary.blocked > 0) {
    return "blocked";
  }

  if (summary.total > 0 && summary.passed === summary.total) {
    return "verified";
  }

  return "unverified";
}

function verificationNotes(report: ExecutionReport, differentialReport: DifferentialReport | undefined): string[] {
  const notes: string[] = [];

  if (report.summary.total === 0 && (!differentialReport || differentialReport.summary.total === 0)) {
    notes.push("No configured commands, probes, or tool adapters were found, so merge safety remains unverified.");
  }

  if (report.summary.total === 0 && differentialReport && differentialReport.summary.total > 0) {
    notes.push("No configured execution commands ran; verification includes base/head API contract evidence.");
  }

  if (report.summary.status === "skipped") {
    notes.push("Configured checks were found but skipped. Enable safety.allowCommands to gather execution proof.");
  }

  if (report.summary.blocked > 0) {
    notes.push("At least one configured check was blocked by CodeDecay safety policy.");
  }

  if (report.summary.status === "passed" && report.summary.passed === report.summary.total) {
    notes.push("All configured execution checks included in this report passed.");
  }

  if (report.summary.status === "failed" || report.summary.status === "timed_out" || report.summary.status === "error") {
    notes.push("At least one configured execution check failed, timed out, or errored.");
  }

  if (differentialReport) {
    if (differentialReport.summary.apiContracts.breakingChanges > 0) {
      notes.push("Base/head API contract contains breaking changes. Run Schemathesis, Pact, or client contract tests for the impacted routes before merge.");
    }

    if (differentialReport.summary.apiContracts.nonBreakingChanges > 0) {
      notes.push("Base/head API contract contains non-breaking additions; confirm generated clients and documentation tolerate the new surface.");
    }

    const probeStatuses = differentialReport.results.map((result) => result.status);
    if (probeStatuses.includes("changed")) {
      notes.push("Base/head differential probe behavior changed. Treat this as tool evidence to review before merge.");
    } else if (differentialReport.results.length > 0 && probeStatuses.every((status) => status === "passed")) {
      notes.push("Configured differential probes behaved the same on base and head.");
    } else if (differentialReport.results.length > 0 && probeStatuses.every((status) => status === "skipped")) {
      notes.push("Configured differential probes were skipped. Enable safety.allowCommands to gather base/head behavior proof.");
    } else if (probeStatuses.includes("failed")) {
      notes.push("At least one configured differential probe failed, timed out, or errored.");
    }
  }

  return notes.length > 0 ? notes : ["Some configured checks did not produce execution proof, so the report remains unverified."];
}

function verificationCheckFromCommandResult(result: ExecutionResult): RedteamVerificationSummary["checks"][number] {
  const check: RedteamVerificationSummary["checks"][number] = {
    kind: result.kind,
    name: result.name,
    command: result.command,
    status: result.status,
    proof: proofForStatus(result.status),
    summary: commandSummary(result),
    durationMs: result.durationMs
  };

  if (result.exitCode !== undefined) {
    check.exitCode = result.exitCode;
  }

  if (result.error !== undefined) {
    check.failure = result.error;
  }

  return check;
}

function verificationCheckFromToolAdapterResult(
  result: ExecutionToolAdapterResult
): RedteamVerificationSummary["checks"][number] {
  const check: RedteamVerificationSummary["checks"][number] = {
    kind: result.kind,
    name: result.name,
    command: result.command,
    status: result.status,
    proof: proofForStatus(result.status),
    summary: result.summary,
    durationMs: result.durationMs
  };

  if (result.failure) {
    check.failure = `${result.failure.mode}: ${result.failure.message}`;
  }

  return check;
}

function verificationCheckFromDifferentialResult(result: DifferentialProbeResult): RedteamVerificationSummary["checks"][number] {
  const status = redteamStatusForDifferentialResult(result);
  const check: RedteamVerificationSummary["checks"][number] = {
    kind: "probe",
    name: `Differential: ${result.name}`,
    command: result.command,
    status,
    proof: status === "skipped" ? "missing-proof" : "tool-evidence",
    summary: differentialSummary(result),
    durationMs: result.base.durationMs + result.head.durationMs,
    differentialStatus: result.status,
    differences: [...result.differences],
    base: redteamSideFromDifferentialSide(result.base),
    head: redteamSideFromDifferentialSide(result.head),
    rerunCommand: result.rerunCommand
  };

  if (result.artifacts) {
    check.artifacts = differentialArtifacts(result.artifacts);
  }

  if (result.status === "changed" || result.status === "failed") {
    check.failure = differentialFailure(result);
  }

  if (result.head.exitCode !== undefined) {
    check.exitCode = result.head.exitCode;
  }

  return check;
}

function verificationCheckFromApiContractResult(result: DifferentialApiContractResult): RedteamVerificationSummary["checks"][number] {
  const status = redteamStatusForApiContractResult(result);
  const check: RedteamVerificationSummary["checks"][number] = {
    kind: "api-contract",
    name: `API contract: ${result.schemaPath}`,
    command: result.rerunCommand,
    status,
    proof: "tool-evidence",
    summary: apiContractSummary(result),
    durationMs: 0,
    differentialStatus: result.status,
    differences: [
      ...result.breakingChanges.map((change) => `breaking ${change.kind}: ${change.message}`),
      ...result.nonBreakingChanges.map((change) => `non-breaking ${change.kind}: ${change.message}`)
    ],
    rerunCommand: result.rerunCommand
  };

  if (result.status === "failed" || result.breakingChanges.length > 0) {
    check.failure = result.errors.length > 0
      ? result.errors.join("; ")
      : result.breakingChanges.map((change) => change.message).join("; ");
  }

  return check;
}

function proofForStatus(status: AdapterStatus): RedteamVerificationSummary["checks"][number]["proof"] {
  return didExecute(status) ? "tool-evidence" : "missing-proof";
}

function didExecute(status: RedteamExecutionStatus): boolean {
  return status === "passed" || status === "failed" || status === "timed_out" || status === "error";
}

function verificationCounts(
  checks: RedteamVerificationSummary["checks"],
  durationMs: number
): Pick<RedteamVerificationSummary, "total" | "passed" | "failed" | "skipped" | "blocked" | "timedOut" | "errors" | "durationMs"> {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    timedOut: checks.filter((check) => check.status === "timed_out").length,
    errors: checks.filter((check) => check.status === "error").length,
    durationMs
  };
}

function redteamStatusForDifferentialResult(result: DifferentialProbeResult): RedteamExecutionStatus {
  if (result.status === "passed") {
    return "passed";
  }

  if (result.status === "skipped") {
    return "skipped";
  }

  if (result.status === "changed") {
    return "failed";
  }

  if (result.base.status === "timed_out" || result.head.status === "timed_out") {
    return "timed_out";
  }

  return "error";
}

function redteamStatusForApiContractResult(result: DifferentialApiContractResult): RedteamExecutionStatus {
  if (result.status === "failed") {
    return "error";
  }

  if (result.status === "changed") {
    return "failed";
  }

  return "passed";
}

function redteamSideFromDifferentialSide(side: DifferentialSideResult): NonNullable<RedteamVerificationSummary["checks"][number]["base"]> {
  const mapped = {
    status: side.status,
    durationMs: side.durationMs
  };

  return side.exitCode === undefined ? mapped : { ...mapped, exitCode: side.exitCode };
}

function differentialArtifacts(artifacts: DifferentialProbeArtifacts): NonNullable<RedteamVerificationSummary["checks"][number]["artifacts"]> {
  return { ...artifacts };
}

function differentialSummary(result: DifferentialProbeResult): string {
  if (result.status === "changed") {
    return `Differential probe behavior changed: ${result.differences.join("; ") || "base/head output differs"}.`;
  }

  if (result.status === "failed") {
    return "Differential probe failed, timed out, or errored on base or head.";
  }

  if (result.status === "skipped") {
    return "Differential probe was skipped by safety policy.";
  }

  return "Differential probe behavior matched on base and head.";
}

function differentialFailure(result: DifferentialProbeResult): string {
  if (result.status === "changed") {
    return result.differences.join("; ") || "Base/head behavior changed.";
  }

  return [result.base.error, result.head.error].filter(Boolean).join("; ") || "Differential probe did not complete.";
}

function apiContractSummary(result: DifferentialApiContractResult): string {
  if (result.status === "failed") {
    return `API contract diff failed for ${result.schemaPath}: ${result.errors.join("; ")}`;
  }

  if (result.breakingChanges.length > 0) {
    return `API contract has ${result.breakingChanges.length} breaking change(s). Add or run Schemathesis, Pact, or client contract tests for impacted routes.`;
  }

  if (result.nonBreakingChanges.length > 0) {
    return `API contract has ${result.nonBreakingChanges.length} non-breaking addition(s). Confirm clients and docs tolerate the new surface.`;
  }

  return "API contract matched between base and head.";
}

function commandSummary(result: ExecutionResult): string {
  if (result.error) {
    return result.error;
  }

  const stderr = result.stderr.trim();
  if (stderr) {
    return stderr.split(/\r?\n/)[0] ?? stderr;
  }

  const stdout = result.stdout.trim();
  if (stdout) {
    return stdout.split(/\r?\n/)[0] ?? stdout;
  }

  if (result.status === "passed") {
    return "Configured command passed.";
  }

  if (result.status === "skipped") {
    return "Configured command was skipped.";
  }

  if (result.status === "blocked") {
    return "Configured command was blocked.";
  }

  return `Configured command status: ${result.status}.`;
}
