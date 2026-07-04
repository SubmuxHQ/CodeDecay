import { loadCodeDecayConfig } from "@submuxhq/codedecay-config";
import { createRedteamReport, type RedteamExecutionStatus, type RedteamVerificationSummary } from "@submuxhq/codedecay-redteam";
import { loadCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { AdapterStatus } from "@submuxhq/codedecay-adapters";
import type { AgentOptions, AnalyzeOptions, CliAnalysisContext, CliRuntime, RedteamOptions } from "../types";
import { loadConfiguredRedteamMemory } from "../memory/configured-providers";
import type { ExecutionReport, ExecutionResult, ExecutionToolAdapterResult } from "../types";
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
  const investigation = "investigate" in options && options.investigate
    ? await createRedteamInvestigation({
        llmConfig: loadedConfig.config.llm,
        analysisReport: analysis.report,
        memory: memoryContext.memory,
        memorySource: memoryContext.sourcePath,
        skills: loadedSkills
      })
    : undefined;
  const verification = "withChecks" in options && options.withChecks
    ? verificationFromExecutionReport(await createExecutionReport(rootDir, loadedConfig, executionDependencies(dependencies)))
    : undefined;

  return createRedteamReport({
    analysisReport: analysis.report,
    config: loadedConfig.config,
    configSource: loadedConfig.sourcePath,
    memory: memoryContext.memory,
    memorySource: memoryContext.sourcePath,
    memoryProviderSources: memoryContext.providerSources,
    skills: loadedSkills,
    investigation,
    verification
  });
}

function executionDependencies(dependencies: RedteamReportDependencies): RunExecuteCommandDependencies {
  return {
    createAnalysisContext: dependencies.createAnalysisContext,
    writeOutput: dependencies.writeOutput ?? (() => {
      // createExecutionReport only needs writeOutput when an execution path renders nested output.
    })
  };
}

function verificationFromExecutionReport(report: ExecutionReport): RedteamVerificationSummary {
  const checks = [
    ...report.results.map(verificationCheckFromCommandResult),
    ...report.toolAdapters.map(verificationCheckFromToolAdapterResult)
  ];
  return {
    status: verificationStatus(report),
    commandsExecuted: checks.some((check) => didExecute(check.status)),
    total: report.summary.total,
    passed: report.summary.passed,
    failed: report.summary.failed,
    skipped: report.summary.skipped,
    blocked: report.summary.blocked,
    timedOut: report.summary.timedOut,
    errors: report.summary.errors,
    durationMs: report.summary.durationMs,
    checks,
    notes: verificationNotes(report)
  };
}

function verificationStatus(report: ExecutionReport): RedteamVerificationSummary["status"] {
  if (report.summary.errors > 0 || report.summary.timedOut > 0 || report.summary.failed > 0) {
    return "failed";
  }

  if (report.summary.blocked > 0) {
    return "blocked";
  }

  if (report.summary.total > 0 && report.summary.passed === report.summary.total) {
    return "verified";
  }

  return "unverified";
}

function verificationNotes(report: ExecutionReport): string[] {
  if (report.summary.total === 0) {
    return ["No configured commands, probes, or tool adapters were found, so merge safety remains unverified."];
  }

  if (report.summary.status === "skipped") {
    return ["Configured checks were found but skipped. Enable safety.allowCommands to gather execution proof."];
  }

  if (report.summary.blocked > 0) {
    return ["At least one configured check was blocked by CodeDecay safety policy."];
  }

  if (report.summary.status === "passed" && report.summary.passed === report.summary.total) {
    return ["All configured execution checks included in this report passed."];
  }

  if (report.summary.status === "failed" || report.summary.status === "timed_out" || report.summary.status === "error") {
    return ["At least one configured execution check failed, timed out, or errored."];
  }

  return ["Some configured checks did not produce execution proof, so the report remains unverified."];
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

function proofForStatus(status: AdapterStatus): RedteamVerificationSummary["checks"][number]["proof"] {
  return didExecute(status) ? "tool-evidence" : "missing-proof";
}

function didExecute(status: RedteamExecutionStatus): boolean {
  return status === "passed" || status === "failed" || status === "timed_out" || status === "error";
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
