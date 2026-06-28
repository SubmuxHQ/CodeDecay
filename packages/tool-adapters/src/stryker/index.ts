import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type Evidence,
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
import { normalizeArtifactPath } from "../shared/paths";
import { elapsed, isPlainObject, optionalStringValue, validateNonEmptyString } from "../shared/values";
import type { CodeDecayStrykerToolAdapter, ConfiguredToolHarness, StrykerHarnessOptions } from "../types";

const STRYKER_HARNESS_NAME = "stryker";
const DEFAULT_STRYKER_COMMAND = "pnpm exec stryker run";
const DEFAULT_STRYKER_TIMEOUT_MS = 300_000;
const DEFAULT_STRYKER_REPORT_PATH = "reports/mutation/mutation.json";

interface StrykerMutationReportAnalysis {
  reportPath: string;
  totalMutants: number;
  survivedMutants: number;
  noCoverageMutants: number;
  weakMutants: StrykerWeakMutant[];
  mutationScore?: number | undefined;
  parseError?: string | undefined;
}

interface StrykerWeakMutant {
  id?: string | undefined;
  file: string;
  line?: number | undefined;
  status: "Survived" | "NoCoverage";
  mutatorName?: string | undefined;
  replacement?: string | undefined;
  statusReason?: string | undefined;
}

export function createStrykerHarness(options: StrykerHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_STRYKER_COMMAND;
  validateStrykerOptions({ ...options, command });

  return {
    name: STRYKER_HARNESS_NAME,
    capabilities: ["mutation-testing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "stryker.command",
        description: "Command that runs StrykerJS mutation tests for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createStrykerPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runStrykerPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: STRYKER_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${STRYKER_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredStrykerHarness(
  adapter: CodeDecayStrykerToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_STRYKER_COMMAND;
  const options: StrykerHarnessOptions = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  const configured: ConfiguredToolHarness = {
    kind: "stryker",
    name: "StrykerJS",
    command,
    harness: createStrykerHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createStrykerPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "stryker-mutation-testing",
    harnessName: STRYKER_HARNESS_NAME,
    summary: "Run configured StrykerJS mutation tests and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-stryker",
        title: "Run StrykerJS mutation tests",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runStrykerPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: StrykerHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validateStrykerPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_STRYKER_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: options.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const mutationReport = analyzeStrykerMutationReport(context.cwd, options.reportPath ?? DEFAULT_STRYKER_REPORT_PATH);
  const evidence = [
    strykerEvidenceFromExecution(execution),
    ...strykerEvidenceFromReport(mutationReport, options.command)
  ];
  const artifacts = mutationReport?.reportPath
    ? [
        {
          path: mutationReport.reportPath,
          description: "StrykerJS mutation testing report."
        }
      ]
    : [];

  if (execution.status === "passed") {
    if (mutationReport?.parseError || (mutationReport && mutationReport.weakMutants.length > 0)) {
      const failed = createHarnessFailureResult({
        harnessName: STRYKER_HARNESS_NAME,
        mode: mutationReport.parseError ? "internal-error" : "no-evidence",
        message: mutationReport.parseError ?? strykerReportFailureMessage(mutationReport),
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
      harnessName: STRYKER_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts,
      summary: "StrykerJS mutation checks passed."
    };
  }

  const failed = createHarnessFailureResult({
    harnessName: STRYKER_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: strykerFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
  return {
    ...failed,
    artifacts
  };
}

function strykerEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "StrykerJS",
      id: "stryker"
    },
    kind: "mutation",
    severity: evidenceSeverityFromExecution(execution),
    summary: strykerEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function analyzeStrykerMutationReport(
  cwd: string,
  reportPath: string
): StrykerMutationReportAnalysis | undefined {
  const absolutePath = isAbsolute(reportPath) ? reportPath : join(cwd, reportPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const normalizedReportPath = normalizeArtifactPath(cwd, absolutePath);

  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
    return summarizeStrykerMutationReport(parsed, cwd, normalizedReportPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reportPath: normalizedReportPath,
      totalMutants: 0,
      survivedMutants: 0,
      noCoverageMutants: 0,
      weakMutants: [],
      parseError: `Could not parse StrykerJS mutation report at ${normalizedReportPath}: ${message}`
    };
  }
}

function summarizeStrykerMutationReport(
  value: unknown,
  cwd: string,
  reportPath: string
): StrykerMutationReportAnalysis {
  const files = isPlainObject(value) && isPlainObject(value.files) ? value.files : {};
  const weakMutants: StrykerWeakMutant[] = [];
  let totalMutants = 0;
  let survivedMutants = 0;
  let noCoverageMutants = 0;

  for (const [filePath, fileReport] of Object.entries(files)) {
    if (!isPlainObject(fileReport) || !Array.isArray(fileReport.mutants)) {
      continue;
    }

    const normalizedFile = normalizeArtifactPath(cwd, filePath);
    for (const mutant of fileReport.mutants) {
      if (!isPlainObject(mutant)) {
        continue;
      }

      totalMutants += 1;
      const status = normalizeStrykerMutantStatus(mutant.status);
      if (!status) {
        continue;
      }

      if (status === "Survived") {
        survivedMutants += 1;
      } else {
        noCoverageMutants += 1;
      }

      weakMutants.push({
        id: optionalStringValue(mutant.id),
        file: normalizedFile,
        line: readMutantStartLine(mutant.location),
        status,
        mutatorName: optionalStringValue(mutant.mutatorName),
        replacement: optionalStringValue(mutant.replacement),
        statusReason: optionalStringValue(mutant.statusReason)
      });
    }
  }

  return {
    reportPath,
    totalMutants,
    survivedMutants,
    noCoverageMutants,
    weakMutants: weakMutants.sort((left, right) => `${left.file}:${left.line ?? 0}`.localeCompare(`${right.file}:${right.line ?? 0}`)),
    mutationScore: readMutationScore(value)
  };
}

function strykerEvidenceFromReport(
  report: StrykerMutationReportAnalysis | undefined,
  command: string
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseError) {
    return [
      createEvidence({
        source: { kind: "tool", name: "StrykerJS", id: "stryker" },
        kind: "mutation",
        severity: "high",
        summary: report.parseError,
        trusted: true,
        command,
        artifactPath: report.reportPath,
        metadata: {
          reportPath: report.reportPath
        }
      })
    ];
  }

  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "StrykerJS", id: "stryker" },
    kind: "mutation",
    severity: report.weakMutants.length > 0 ? "high" : "info",
    summary:
      report.weakMutants.length > 0
        ? `StrykerJS found ${report.weakMutants.length} surviving or no-coverage mutant(s) in ${new Set(report.weakMutants.map((mutant) => mutant.file)).size} file(s).`
        : "StrykerJS report found no surviving or no-coverage mutants.",
    trusted: true,
    command,
    artifactPath: report.reportPath,
    metadata: compactStrykerReportMetadata(report)
  });

  return [
    summaryEvidence,
    ...report.weakMutants.slice(0, 5).map((mutant) =>
      createEvidence({
        source: { kind: "tool", name: "StrykerJS", id: "stryker" },
        kind: "mutation",
        severity: "high",
        summary: `${mutant.status} ${mutant.mutatorName ?? "mutation"} mutant in ${mutant.file}${mutant.line ? `:${mutant.line}` : ""}.`,
        trusted: true,
        file: mutant.file,
        line: mutant.line,
        command,
        artifactPath: report.reportPath,
        metadata: compactMutantMetadata(mutant)
      })
    )
  ];
}

function strykerReportFailureMessage(report: StrykerMutationReportAnalysis): string {
  return `StrykerJS found ${report.weakMutants.length} surviving or no-coverage mutant(s). Strengthen tests before merge.`;
}

function compactStrykerReportMetadata(report: StrykerMutationReportAnalysis): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    reportPath: report.reportPath,
    totalMutants: report.totalMutants,
    survivedMutants: report.survivedMutants,
    noCoverageMutants: report.noCoverageMutants
  };

  if (report.mutationScore !== undefined) {
    metadata.mutationScore = report.mutationScore;
  }

  return metadata;
}

function compactMutantMetadata(mutant: StrykerWeakMutant): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    status: mutant.status
  };

  if (mutant.id) {
    metadata.id = mutant.id;
  }

  if (mutant.mutatorName) {
    metadata.mutatorName = mutant.mutatorName;
  }

  if (mutant.replacement) {
    metadata.replacement = mutant.replacement;
  }

  if (mutant.statusReason) {
    metadata.statusReason = mutant.statusReason;
  }

  return metadata;
}

function strykerEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "StrykerJS mutation checks passed.";
  }

  if (execution.status === "skipped") {
    return "StrykerJS mutation checks were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `StrykerJS command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "StrykerJS command timed out.";
  }

  if (execution.status === "error") {
    return `StrykerJS command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `StrykerJS command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function strykerFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "StrykerJS command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `StrykerJS command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return strykerEvidenceSummaryFromExecution(execution);
}

function normalizeStrykerMutantStatus(value: unknown): "Survived" | "NoCoverage" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "survived") {
    return "Survived";
  }

  if (normalized === "nocoverage") {
    return "NoCoverage";
  }

  return undefined;
}

function readMutantStartLine(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.start)) {
    return undefined;
  }

  return typeof value.start.line === "number" && Number.isFinite(value.start.line)
    ? value.start.line
    : undefined;
}

function readMutationScore(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.thresholds)) {
    return undefined;
  }

  const score = value.thresholds.mutationScore;
  return typeof score === "number" && Number.isFinite(score) ? score : undefined;
}

function validateStrykerOptions(options: StrykerHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "StrykerJS command");

  if (options.reportPath !== undefined) {
    validateNonEmptyString(options.reportPath, "StrykerJS reportPath");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("StrykerJS timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("StrykerJS outputLimit must be a positive integer.");
  }
}

function validateStrykerPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== STRYKER_HARNESS_NAME) {
    throw new Error(`StrykerJS harness cannot run plan for ${plan.harnessName}.`);
  }
}
