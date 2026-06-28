import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type Evidence,
  type EvidenceSeverity,
  type HarnessPlan,
  type HarnessPlanInput,
  type HarnessRunContext,
  type HarnessRunResult
} from "@submuxhq/codedecay-harness";
import {
  compactExecutionMetadata,
  evidenceSeverityFromExecution,
  failureModeFromExecution,
  harnessStatusFromExecution
} from "../shared/execution";
import { normalizeArtifactPath, shellQuote } from "../shared/paths";
import { elapsed, isPlainObject, optionalNumberValue, optionalStringValue, validateNonEmptyString } from "../shared/values";
import type {
  CodeDecaySemgrepToolAdapter,
  CodeDecayToolSeverity,
  ConfiguredToolHarness,
  SemgrepHarnessOptions
} from "../types";

const SEMGREP_HARNESS_NAME = "semgrep";
const DEFAULT_SEMGREP_TIMEOUT_MS = 180_000;
const DEFAULT_SEMGREP_FAIL_ON_SEVERITY: CodeDecayToolSeverity = "high";
const LOCAL_SEMGREP_CONFIG_CANDIDATES = [".semgrep.yml", ".semgrep.yaml", ".semgrep", "semgrep.yml", "semgrep.yaml"];
interface SemgrepReportAnalysis {
  artifactPath?: string | undefined;
  findings: SemgrepFinding[];
  parseError?: string | undefined;
}

interface SemgrepFinding {
  checkId?: string | undefined;
  path?: string | undefined;
  line?: number | undefined;
  endLine?: number | undefined;
  message: string;
  severity: EvidenceSeverity;
  rawSeverity?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  fingerprint?: string | undefined;
}

export function createSemgrepHarness(options: SemgrepHarnessOptions = {}): CodeDecayHarness {
  validateSemgrepOptions(options);

  return {
    name: SEMGREP_HARNESS_NAME,
    capabilities: ["static-analysis", "execution"],
    requiredConfig: [
      {
        key: "semgrep.command",
        description: "Optional explicit command that runs Semgrep. Required for registry or remote configs.",
        required: false
      },
      {
        key: "semgrep.config",
        description: "Local Semgrep config path used when no explicit command is provided.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createSemgrepPlan(input, resolveSemgrepDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runSemgrepPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: SEMGREP_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${SEMGREP_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredSemgrepHarness(
  adapter: CodeDecaySemgrepToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SemgrepHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.config !== undefined) {
    options.config = adapter.config;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  if (adapter.failOnSeverity !== undefined) {
    options.failOnSeverity = adapter.failOnSeverity;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "semgrep",
    name: "Semgrep",
    command: resolveSemgrepDisplayCommand(options),
    harness: createSemgrepHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createSemgrepPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "semgrep-static-analysis",
    harnessName: SEMGREP_HARNESS_NAME,
    summary: "Run configured Semgrep static analysis and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-semgrep",
        title: "Run Semgrep static analysis",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runSemgrepPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: SemgrepHarnessOptions
): Promise<HarnessRunResult> {
  validateSemgrepPlan(plan);
  const startedAt = Date.now();
  const resolved = resolveSemgrepRunCommand(context.cwd, options);
  const failOnSeverity = options.failOnSeverity ?? DEFAULT_SEMGREP_FAIL_ON_SEVERITY;

  if (!resolved.command) {
    const durationMs = elapsed(startedAt);
    const evidence = [
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: "info",
        summary: "Semgrep was skipped because no local Semgrep config was configured or discovered.",
        trusted: true,
        command: resolved.displayCommand,
        metadata: {
          status: "skipped",
          searchedConfigs: LOCAL_SEMGREP_CONFIG_CANDIDATES
        }
      })
    ];

    return createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "missing-config",
      message: "Semgrep requires a local config path or explicit command before CodeDecay can run it.",
      status: "skipped",
      durationMs,
      evidence
    });
  }

  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_SEMGREP_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: resolved.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const canParseSemgrepReport = execution.status === "passed" || execution.status === "failed";
  const analysis = canParseSemgrepReport
    ? analyzeSemgrepReport(context.cwd, options.reportPath, execution.stdout)
    : undefined;
  const artifacts = analysis?.artifactPath
    ? [
        {
          path: analysis.artifactPath,
          description: "Semgrep JSON report."
        }
      ]
    : [];
  const evidence = [
    semgrepEvidenceFromExecution(execution),
    ...semgrepEvidenceFromReport(analysis, execution.command, failOnSeverity)
  ];

  if (execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: semgrepFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (analysis?.parseError) {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "internal-error",
      message: analysis.parseError,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  const thresholdFindings = analysis ? findingsAtOrAboveThreshold(analysis.findings, failOnSeverity) : [];
  if (thresholdFindings.length > 0) {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "tool-finding",
      message: `Semgrep found ${thresholdFindings.length} finding(s) at or above ${failOnSeverity} severity.`,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  return {
    harnessName: SEMGREP_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: "Semgrep static analysis passed."
  };
}

function semgrepEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Semgrep",
      id: "semgrep"
    },
    kind: "static-analysis",
    severity: evidenceSeverityFromExecution(execution),
    summary: semgrepEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function analyzeSemgrepReport(
  cwd: string,
  reportPath: string | undefined,
  stdout: string
): SemgrepReportAnalysis | undefined {
  if (reportPath) {
    const absolutePath = isAbsolute(reportPath) ? reportPath : join(cwd, reportPath);
    if (existsSync(absolutePath)) {
      const artifactPath = normalizeArtifactPath(cwd, absolutePath);
      return parseSemgrepJson(readFileSync(absolutePath, "utf8"), cwd, artifactPath);
    }
  }

  if (!stdout.trim()) {
    return undefined;
  }

  return parseSemgrepJson(stdout, cwd, reportPath ? normalizeArtifactPath(cwd, reportPath) : undefined);
}

function parseSemgrepJson(raw: string, cwd: string, artifactPath: string | undefined): SemgrepReportAnalysis {
  try {
    const parsed = JSON.parse(raw);
    return summarizeSemgrepReport(parsed, cwd, artifactPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      artifactPath,
      findings: [],
      parseError: `Could not parse Semgrep JSON${artifactPath ? ` at ${artifactPath}` : ""}: ${message}`
    };
  }
}

function summarizeSemgrepReport(
  value: unknown,
  cwd: string,
  artifactPath: string | undefined
): SemgrepReportAnalysis {
  const results = isPlainObject(value) && Array.isArray(value.results) ? value.results : [];
  const findings = results
    .map((item) => normalizeSemgrepFinding(item, cwd))
    .filter((finding): finding is SemgrepFinding => Boolean(finding))
    .sort((left, right) => `${left.path ?? ""}:${left.line ?? 0}:${left.checkId ?? ""}`.localeCompare(`${right.path ?? ""}:${right.line ?? 0}:${right.checkId ?? ""}`));

  return {
    artifactPath,
    findings
  };
}

function normalizeSemgrepFinding(value: unknown, cwd: string): SemgrepFinding | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const extra = isPlainObject(value.extra) ? value.extra : {};
  const start = isPlainObject(value.start) ? value.start : {};
  const end = isPlainObject(value.end) ? value.end : {};
  const rawPath = optionalStringValue(value.path);
  const rawSeverity = optionalStringValue(extra.severity);
  const metadata = isPlainObject(extra.metadata) ? compactSemgrepMetadata(extra.metadata) : undefined;

  return {
    checkId: optionalStringValue(value.check_id),
    path: rawPath ? normalizeArtifactPath(cwd, rawPath) : undefined,
    line: optionalNumberValue(start.line),
    endLine: optionalNumberValue(end.line),
    message: optionalStringValue(extra.message) ?? optionalStringValue(value.message) ?? "Semgrep finding.",
    severity: semgrepSeverityToEvidenceSeverity(rawSeverity),
    rawSeverity,
    metadata,
    fingerprint: optionalStringValue(extra.fingerprint)
  };
}

function semgrepEvidenceFromReport(
  report: SemgrepReportAnalysis | undefined,
  command: string,
  failOnSeverity: CodeDecayToolSeverity
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseError) {
    return [
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: "high",
        summary: report.parseError,
        trusted: true,
        command,
        artifactPath: report.artifactPath,
        metadata: {
          reportPath: report.artifactPath
        }
      })
    ];
  }

  const thresholdFindings = findingsAtOrAboveThreshold(report.findings, failOnSeverity);
  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "Semgrep", id: "semgrep" },
    kind: "static-analysis",
    severity: report.findings.length === 0 ? "info" : thresholdFindings.length > 0 ? "high" : highestSemgrepEvidenceSeverity(report.findings),
    summary:
      report.findings.length > 0
        ? `Semgrep found ${report.findings.length} finding(s); ${thresholdFindings.length} at or above ${failOnSeverity} severity.`
        : "Semgrep found no findings.",
    trusted: true,
    command,
    artifactPath: report.artifactPath,
    metadata: {
      reportPath: report.artifactPath,
      findingCount: report.findings.length,
      failOnSeverity,
      thresholdFindingCount: thresholdFindings.length
    }
  });

  return [
    summaryEvidence,
    ...report.findings.slice(0, 10).map((finding) =>
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: finding.severity,
        summary: semgrepFindingSummary(finding),
        trusted: true,
        file: finding.path,
        line: finding.line,
        command,
        artifactPath: report.artifactPath,
        metadata: compactSemgrepFindingMetadata(finding)
      })
    )
  ];
}

function findingsAtOrAboveThreshold(
  findings: SemgrepFinding[],
  threshold: CodeDecayToolSeverity
): SemgrepFinding[] {
  return findings.filter((finding) => semgrepFindingSeverityLevel(finding.severity) >= codeDecayToolSeverityLevel(threshold));
}

function semgrepFindingSeverityLevel(severity: EvidenceSeverity): number {
  if (severity === "high") {
    return codeDecayToolSeverityLevel("high");
  }

  if (severity === "medium") {
    return codeDecayToolSeverityLevel("medium");
  }

  return codeDecayToolSeverityLevel("low");
}

function codeDecayToolSeverityLevel(severity: CodeDecayToolSeverity): number {
  if (severity === "high") {
    return 2;
  }

  if (severity === "medium") {
    return 1;
  }

  return 0;
}

function semgrepSeverityToEvidenceSeverity(value: string | undefined): EvidenceSeverity {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "ERROR") {
    return "high";
  }

  if (normalized === "WARNING") {
    return "medium";
  }

  if (normalized === "INFO") {
    return "low";
  }

  return "low";
}

function highestSemgrepEvidenceSeverity(findings: SemgrepFinding[]): EvidenceSeverity {
  if (findings.some((finding) => finding.severity === "high")) {
    return "high";
  }

  if (findings.some((finding) => finding.severity === "medium")) {
    return "medium";
  }

  return "low";
}

function semgrepFindingSummary(finding: SemgrepFinding): string {
  const rule = finding.checkId ? `${finding.checkId}: ` : "";
  const location = finding.path ? ` in ${finding.path}${finding.line ? `:${finding.line}` : ""}` : "";
  return `${rule}${finding.message}${location}.`;
}

function compactSemgrepFindingMetadata(finding: SemgrepFinding): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    severity: finding.rawSeverity ?? finding.severity
  };

  if (finding.checkId) {
    metadata.checkId = finding.checkId;
  }

  if (finding.endLine !== undefined) {
    metadata.endLine = finding.endLine;
  }

  if (finding.fingerprint) {
    metadata.fingerprint = finding.fingerprint;
  }

  if (finding.metadata) {
    metadata.metadata = finding.metadata;
  }

  return metadata;
}

function compactSemgrepMetadata(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const allowed = ["category", "confidence", "impact", "likelihood", "technology", "cwe", "owasp", "references"];
  const metadata: Record<string, unknown> = {};

  for (const key of allowed) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      metadata[key] = item;
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "string" || typeof entry === "number")) {
      metadata[key] = item.slice(0, 10);
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function semgrepEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Semgrep static analysis command passed.";
  }

  if (execution.status === "skipped") {
    return "Semgrep static analysis was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Semgrep command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Semgrep command timed out.";
  }

  if (execution.status === "error") {
    return `Semgrep command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Semgrep command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function semgrepFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Semgrep command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Semgrep command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return semgrepEvidenceSummaryFromExecution(execution);
}

function resolveSemgrepRunCommand(
  cwd: string,
  options: SemgrepHarnessOptions
): { command?: string | undefined; displayCommand: string } {
  if (options.command) {
    return {
      command: options.command,
      displayCommand: options.command
    };
  }

  const config = options.config ?? discoverLocalSemgrepConfig(cwd);
  const displayCommand = resolveSemgrepDisplayCommand(options);
  if (!config) {
    return {
      displayCommand
    };
  }

  return {
    command: buildSemgrepCommand(config),
    displayCommand
  };
}

export function resolveSemgrepDisplayCommand(options: Pick<SemgrepHarnessOptions, "command" | "config">): string {
  if (options.command) {
    return options.command;
  }

  return buildSemgrepCommand(options.config ?? "<local-config>");
}

function buildSemgrepCommand(config: string): string {
  return `semgrep scan --config ${shellQuote(config)} --json --metrics=off --disable-version-check`;
}

function discoverLocalSemgrepConfig(cwd: string): string | undefined {
  return LOCAL_SEMGREP_CONFIG_CANDIDATES.find((candidate) => existsSync(join(cwd, candidate)));
}

function validateSemgrepOptions(options: SemgrepHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Semgrep command");
  }

  if (options.config !== undefined) {
    validateNonEmptyString(options.config, "Semgrep config");
    validateLocalSemgrepConfig(options.config);
  }

  if (options.reportPath !== undefined) {
    validateNonEmptyString(options.reportPath, "Semgrep reportPath");
  }

  if (options.failOnSeverity !== undefined && !isCodeDecayToolSeverity(options.failOnSeverity)) {
    throw new Error("Semgrep failOnSeverity must be low, medium, or high.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Semgrep timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Semgrep outputLimit must be a positive integer.");
  }
}

function validateLocalSemgrepConfig(config: string): void {
  const normalized = config.trim().toLowerCase();
  if (normalized === "auto" || normalized.includes("://") || normalized.startsWith("p/") || normalized.startsWith("r/")) {
    throw new Error("Semgrep config must be a local path. Use semgrep.command for registry, auto, or remote configs.");
  }
}

function validateSemgrepPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== SEMGREP_HARNESS_NAME) {
    throw new Error(`Semgrep harness cannot run plan for ${plan.harnessName}.`);
  }
}

function isCodeDecayToolSeverity(value: string): value is CodeDecayToolSeverity {
  return value === "low" || value === "medium" || value === "high";
}
