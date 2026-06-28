import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
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
import { normalizeArtifactPath, normalizePath, readLocalFile } from "../shared/paths";
import { dedupeNumbers, dedupeStrings, elapsed, isPlainObject, validateNonEmptyString } from "../shared/values";
import type {
  CodeDecayCoverageFailOn,
  CodeDecayCoverageToolAdapter,
  ConfiguredToolHarness,
  CoverageHarnessOptions
} from "../types";

const COVERAGE_HARNESS_NAME = "coverage";
const DEFAULT_COVERAGE_TIMEOUT_MS = 120_000;
const DEFAULT_COVERAGE_FAIL_ON: CodeDecayCoverageFailOn = "none";
const DEFAULT_COVERAGE_REPORT_PATHS = ["coverage/coverage-final.json", "coverage-final.json", "coverage/lcov.info", "lcov.info"];
const DEFAULT_COVERAGE_DISCOVERY_DIRS = ["coverage", ".v8-coverage", ".nyc_output"];

type CoverageSourceKind = "istanbul" | "lcov" | "v8";

interface CoverageLineMapEntry {
  measured: Set<number>;
  covered: Set<number>;
  sourceKinds: Set<CoverageSourceKind>;
  sourcePaths: Set<string>;
}

interface CoverageArtifactSource {
  kind: CoverageSourceKind;
  path: string;
}

interface CoverageFileSummary {
  path: string;
  measuredLines: number[];
  coveredLines: number[];
  uncoveredLines: number[];
  sourceKinds: CoverageSourceKind[];
  sourcePaths: string[];
}

interface CoverageReportAnalysis {
  sources: CoverageArtifactSource[];
  files: CoverageFileSummary[];
  totals: {
    files: number;
    measuredLines: number;
    coveredLines: number;
    uncoveredLines: number;
  };
  parseErrors: string[];
}

export function createCoverageHarness(options: CoverageHarnessOptions = {}): CodeDecayHarness {
  validateCoverageOptions(options);

  return {
    name: COVERAGE_HARNESS_NAME,
    capabilities: ["coverage", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "coverage.command",
        description: "Optional command that runs the repo's own coverage-producing tests.",
        required: false
      },
      {
        key: "coverage.reportPaths",
        description: "Optional local Istanbul, LCOV, or V8 coverage artifact paths.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createCoveragePlan(input, resolveCoverageDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runCoveragePlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: COVERAGE_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${COVERAGE_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredCoverageHarness(
  adapter: CodeDecayCoverageToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: CoverageHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.reportPaths !== undefined) {
    options.reportPaths = adapter.reportPaths;
  }

  if (adapter.failOn !== undefined) {
    options.failOn = adapter.failOn;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "coverage",
    name: "Coverage",
    command: resolveCoverageDisplayCommand(options),
    harness: createCoverageHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createCoveragePlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "coverage-evidence",
    harnessName: COVERAGE_HARNESS_NAME,
    summary: "Run or collect configured coverage evidence from local artifacts.",
    requiresApproval: command !== "collect coverage artifacts" && !allowCommands,
    steps: [
      {
        id: "run-or-collect-coverage",
        title: "Run or collect coverage evidence",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runCoveragePlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: CoverageHarnessOptions
): Promise<HarnessRunResult> {
  validateCoveragePlan(plan);
  const startedAt = Date.now();
  const failOn = options.failOn ?? DEFAULT_COVERAGE_FAIL_ON;
  let execution: CommandExecutionResult | undefined;

  if (options.command) {
    const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS;
    execution = await runConfiguredCommand({
      command: options.command,
      cwd: context.cwd,
      timeoutMs,
      outputLimit: options.outputLimit,
      safety: {
        allowCommands: options.allowCommands ?? false,
        allowUnsafeCommands: options.allowUnsafeCommands
      }
    });
  }

  const durationMs = elapsed(startedAt);
  const canParseCoverage = !execution || execution.status === "passed" || execution.status === "failed";
  const analysis = canParseCoverage ? analyzeCoverageReports(context.cwd, options.reportPaths) : undefined;
  const artifacts = analysis?.sources.map((source) => ({
    path: source.path,
    description: `${source.kind.toUpperCase()} coverage report.`
  })) ?? [];
  const command = options.command ?? "collect coverage artifacts";
  const evidence = [
    ...(execution ? [coverageEvidenceFromExecution(execution)] : [coverageCollectionEvidence(command)]),
    ...coverageEvidenceFromReport(analysis, command, failOn)
  ];

  if (execution && execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: coverageFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (!analysis) {
    const message = options.command
      ? "Coverage command completed, but no supported coverage artifact was found."
      : "No supported coverage artifact was configured or discovered.";
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: options.command ? "no-evidence" : "missing-config",
      message,
      status: options.command ? "failed" : "skipped",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (analysis.parseErrors.length > 0) {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: "internal-error",
      message: `Could not parse ${analysis.parseErrors.length} coverage artifact(s).`,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (failOn === "uncovered" && analysis.totals.uncoveredLines > 0) {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: "tool-finding",
      message: `Coverage artifacts contain ${analysis.totals.uncoveredLines} uncovered measured line(s).`,
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
    harnessName: COVERAGE_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: "Coverage evidence collected."
  };
}

function coverageEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Coverage",
      id: "coverage"
    },
    kind: "coverage",
    severity: evidenceSeverityFromExecution(execution),
    summary: coverageEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function coverageCollectionEvidence(command: string): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Coverage",
      id: "coverage"
    },
    kind: "coverage",
    severity: "info",
    summary: "Coverage adapter is collecting existing local coverage artifacts without running a command.",
    trusted: true,
    command,
    metadata: {
      status: "collected"
    }
  });
}

function analyzeCoverageReports(cwd: string, reportPaths: string[] | undefined): CoverageReportAnalysis | undefined {
  const artifacts = findCoverageArtifacts(cwd, reportPaths);
  if (artifacts.length === 0) {
    return undefined;
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  const sources: CoverageArtifactSource[] = [];
  const parseErrors: string[] = [];

  for (const artifact of artifacts) {
    const parsed =
      artifact.kind === "istanbul"
        ? readIstanbulCoverage(cwd, artifact.absolutePath)
        : artifact.kind === "lcov"
          ? readLcovCoverage(cwd, artifact.absolutePath)
          : readV8Coverage(cwd, artifact.absolutePath);

    if (parsed.parseError) {
      parseErrors.push(parsed.parseError);
      continue;
    }

    if (parsed.linesByFile.size === 0) {
      continue;
    }

    sources.push({
      kind: artifact.kind,
      path: artifact.relativePath
    });

    for (const [path, lines] of parsed.linesByFile) {
      mergeCoverageEntry(linesByFile, path, lines);
    }
  }

  if (sources.length === 0 && parseErrors.length === 0) {
    return undefined;
  }

  const files = [...linesByFile.entries()]
    .map(([path, entry]) => {
      const measuredLines = dedupeNumbers([...entry.measured]);
      const coveredLines = measuredLines.filter((line) => entry.covered.has(line));
      const uncoveredLines = measuredLines.filter((line) => !entry.covered.has(line));
      return {
        path,
        measuredLines,
        coveredLines,
        uncoveredLines,
        sourceKinds: dedupeStrings([...entry.sourceKinds]) as CoverageSourceKind[],
        sourcePaths: dedupeStrings([...entry.sourcePaths])
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    sources: dedupeCoverageSources(sources),
    files,
    totals: {
      files: files.length,
      measuredLines: files.reduce((sum, file) => sum + file.measuredLines.length, 0),
      coveredLines: files.reduce((sum, file) => sum + file.coveredLines.length, 0),
      uncoveredLines: files.reduce((sum, file) => sum + file.uncoveredLines.length, 0)
    },
    parseErrors
  };
}

function coverageEvidenceFromReport(
  report: CoverageReportAnalysis | undefined,
  command: string,
  failOn: CodeDecayCoverageFailOn
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseErrors.length > 0) {
    return [
      createEvidence({
        source: { kind: "tool", name: "Coverage", id: "coverage" },
        kind: "coverage",
        severity: "high",
        summary: `Could not parse ${report.parseErrors.length} coverage artifact(s).`,
        trusted: true,
        command,
        metadata: {
          parseErrors: report.parseErrors.slice(0, 5)
        }
      })
    ];
  }

  const uncoveredFiles = report.files.filter((file) => file.uncoveredLines.length > 0);
  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "Coverage", id: "coverage" },
    kind: "coverage",
    severity: failOn === "uncovered" && report.totals.uncoveredLines > 0 ? "high" : report.totals.uncoveredLines > 0 ? "medium" : "info",
    summary:
      report.totals.uncoveredLines > 0
        ? `Coverage artifacts measured ${report.totals.measuredLines} line(s); ${report.totals.uncoveredLines} line(s) are uncovered.`
        : `Coverage artifacts measured ${report.totals.measuredLines} covered line(s) across ${report.totals.files} file(s).`,
    trusted: true,
    command,
    metadata: {
      sources: report.sources,
      failOn,
      ...report.totals
    }
  });

  return [
    summaryEvidence,
    ...uncoveredFiles.slice(0, 10).map((file) =>
      createEvidence({
        source: { kind: "tool", name: "Coverage", id: "coverage" },
        kind: "coverage",
        severity: failOn === "uncovered" ? "high" : "medium",
        summary: `${file.path} has ${file.uncoveredLines.length} uncovered measured line(s).`,
        trusted: true,
        file: file.path,
        line: file.uncoveredLines[0],
        command,
        artifactPath: file.sourcePaths[0],
        metadata: compactCoverageFileMetadata(file)
      })
    )
  ];
}

function compactCoverageFileMetadata(file: CoverageFileSummary): Record<string, unknown> {
  return {
    measuredLines: file.measuredLines.length,
    coveredLines: file.coveredLines.length,
    uncoveredLines: file.uncoveredLines.length,
    firstUncoveredLines: file.uncoveredLines.slice(0, 10),
    sourceKinds: file.sourceKinds,
    sourcePaths: file.sourcePaths
  };
}

function findCoverageArtifacts(
  cwd: string,
  reportPaths: string[] | undefined
): Array<{ kind: CoverageSourceKind; absolutePath: string; relativePath: string }> {
  const discovered = new Map<string, { kind: CoverageSourceKind; absolutePath: string; relativePath: string }>();
  const candidates = reportPaths ?? DEFAULT_COVERAGE_REPORT_PATHS;

  for (const candidate of candidates) {
    collectCoverageCandidate(cwd, candidate, discovered);
  }

  if (reportPaths === undefined) {
    for (const directory of DEFAULT_COVERAGE_DISCOVERY_DIRS) {
      collectCoverageCandidate(cwd, directory, discovered);
    }
  }

  return [...discovered.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function collectCoverageCandidate(
  cwd: string,
  candidate: string,
  discovered: Map<string, { kind: CoverageSourceKind; absolutePath: string; relativePath: string }>
): void {
  const absolutePath = isAbsolute(candidate) ? candidate : join(cwd, candidate);
  if (!existsSync(absolutePath)) {
    return;
  }

  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    for (const file of listCoverageFiles(cwd, absolutePath)) {
      addCoverageArtifact(cwd, file, discovered);
    }
    return;
  }

  addCoverageArtifact(cwd, absolutePath, discovered);
}

function listCoverageFiles(cwd: string, currentDir: string): string[] {
  const relativeDir = relative(cwd, currentDir).replaceAll("\\", "/");
  if (relativeDir.startsWith("..")) {
    return [];
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCoverageFiles(cwd, absolutePath));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

function addCoverageArtifact(
  cwd: string,
  absolutePath: string,
  discovered: Map<string, { kind: CoverageSourceKind; absolutePath: string; relativePath: string }>
): void {
  const kind = detectCoverageArtifactKind(absolutePath);
  if (!kind) {
    return;
  }

  discovered.set(absolutePath, {
    kind,
    absolutePath,
    relativePath: normalizeArtifactPath(cwd, absolutePath)
  });
}

function detectCoverageArtifactKind(absolutePath: string): CoverageSourceKind | undefined {
  const normalized = normalizePath(absolutePath).toLowerCase();
  if (normalized.endsWith("/coverage-final.json") || normalized.endsWith("coverage-final.json")) {
    return "istanbul";
  }

  if (normalized.endsWith("/lcov.info") || normalized.endsWith("lcov.info")) {
    return "lcov";
  }

  if (normalized.endsWith(".json")) {
    return "v8";
  }

  return undefined;
}

function readIstanbulCoverage(
  cwd: string,
  absolutePath: string
): { linesByFile: Map<string, CoverageLineMapEntry>; parseError?: string | undefined } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  if (!isPlainObject(parsed)) {
    return { linesByFile: new Map() };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  for (const [rawPath, value] of Object.entries(parsed)) {
    if (!isPlainObject(value)) {
      continue;
    }

    const normalizedPath = normalizeCoveragePath(cwd, rawPath);
    if (!normalizedPath) {
      continue;
    }

    if (isPlainObject(value.l)) {
      for (const [rawLine, rawCount] of Object.entries(value.l)) {
        const line = Number(rawLine);
        const count = Number(rawCount);
        if (!Number.isInteger(line) || Number.isNaN(count)) {
          continue;
        }

        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", normalizeArtifactPath(cwd, absolutePath));
      }
      continue;
    }

    if (!isPlainObject(value.statementMap) || !isPlainObject(value.s)) {
      continue;
    }

    for (const [statementId, statement] of Object.entries(value.statementMap)) {
      if (!isPlainObject(statement) || !isPlainObject(statement.start) || !isPlainObject(statement.end)) {
        continue;
      }

      const startLine = Number(statement.start.line);
      const endLine = Number(statement.end.line);
      const count = Number(value.s[statementId]);
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || Number.isNaN(count)) {
        continue;
      }

      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", normalizeArtifactPath(cwd, absolutePath));
      }
    }
  }

  return { linesByFile };
}

function readLcovCoverage(
  cwd: string,
  absolutePath: string
): { linesByFile: Map<string, CoverageLineMapEntry>; parseError?: string | undefined } {
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  let currentFile: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = normalizeCoveragePath(cwd, line.slice(3).trim());
      continue;
    }

    if (line.startsWith("DA:") && currentFile) {
      const [rawLine, rawCount] = line.slice(3).split(",");
      const lineNumber = Number(rawLine);
      const count = Number(rawCount);
      if (!Number.isInteger(lineNumber) || Number.isNaN(count)) {
        continue;
      }

      addCoverageLine(linesByFile, currentFile, lineNumber, count > 0, "lcov", normalizeArtifactPath(cwd, absolutePath));
      continue;
    }

    if (line === "end_of_record") {
      currentFile = undefined;
    }
  }

  return { linesByFile };
}

function readV8Coverage(
  cwd: string,
  absolutePath: string
): { linesByFile: Map<string, CoverageLineMapEntry>; parseError?: string | undefined } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  for (const script of extractV8Scripts(parsed)) {
    const normalizedPath = normalizeCoveragePath(cwd, script.url);
    if (!normalizedPath) {
      continue;
    }

    const content = readLocalFile(cwd, normalizedPath);
    if (!content) {
      continue;
    }

    const lineOffsets = createLineOffsets(content);
    for (const range of script.ranges) {
      const startLine = lineNumberForOffset(lineOffsets, range.startOffset);
      const endLine = lineNumberForOffset(lineOffsets, Math.max(range.startOffset, range.endOffset - 1));
      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, range.count > 0, "v8", normalizeArtifactPath(cwd, absolutePath));
      }
    }
  }

  return { linesByFile };
}

function extractV8Scripts(value: unknown): Array<{ url: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> {
  const results = Array.isArray(value)
    ? value
    : isPlainObject(value) && Array.isArray(value.result)
      ? value.result
      : [];
  const scripts: Array<{ url: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> = [];

  for (const script of results) {
    if (!isPlainObject(script) || typeof script.url !== "string" || !Array.isArray(script.functions)) {
      continue;
    }

    const ranges: Array<{ startOffset: number; endOffset: number; count: number }> = [];
    for (const fn of script.functions) {
      if (!isPlainObject(fn) || !Array.isArray(fn.ranges)) {
        continue;
      }

      for (const range of fn.ranges) {
        if (!isPlainObject(range)) {
          continue;
        }

        const startOffset = Number(range.startOffset);
        const endOffset = Number(range.endOffset);
        const count = Number(range.count);
        if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || Number.isNaN(count)) {
          continue;
        }

        ranges.push({ startOffset, endOffset, count });
      }
    }

    if (ranges.length > 0) {
      scripts.push({ url: script.url, ranges });
    }
  }

  return scripts;
}

function addCoverageLine(
  linesByFile: Map<string, CoverageLineMapEntry>,
  path: string,
  line: number,
  covered: boolean,
  sourceKind: CoverageSourceKind,
  sourcePath: string
): void {
  if (!Number.isInteger(line) || line <= 0) {
    return;
  }

  const entry =
    linesByFile.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<CoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies CoverageLineMapEntry);

  entry.measured.add(line);
  if (covered) {
    entry.covered.add(line);
  }
  entry.sourceKinds.add(sourceKind);
  entry.sourcePaths.add(normalizePath(sourcePath));
  linesByFile.set(path, entry);
}

function mergeCoverageEntry(
  target: Map<string, CoverageLineMapEntry>,
  path: string,
  entry: CoverageLineMapEntry
): void {
  const existing =
    target.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<CoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies CoverageLineMapEntry);

  for (const line of entry.measured) {
    existing.measured.add(line);
  }

  for (const line of entry.covered) {
    existing.covered.add(line);
  }

  for (const kind of entry.sourceKinds) {
    existing.sourceKinds.add(kind);
  }

  for (const sourcePath of entry.sourcePaths) {
    existing.sourcePaths.add(sourcePath);
  }

  target.set(path, existing);
}

function dedupeCoverageSources(sources: CoverageArtifactSource[]): CoverageArtifactSource[] {
  const seen = new Set<string>();
  const deduped: CoverageArtifactSource[] = [];

  for (const source of sources) {
    const key = `${source.kind}:${source.path}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(source);
  }

  return deduped.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function normalizeCoveragePath(cwd: string, rawPath: string): string | undefined {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return undefined;
  }

  const normalizedInput = normalizePath(rawPath.trim().replace(/^file:\/\//, ""));
  if (normalizedInput.includes("://")) {
    return undefined;
  }

  if (normalizedInput.startsWith("/")) {
    const relativePath = relative(cwd, normalizedInput).replaceAll("\\", "/");
    if (!relativePath.startsWith("../")) {
      return relativePath;
    }
  }

  return normalizedInput.replace(/^\.\//, "");
}

function createLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function lineNumberForOffset(offsets: number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = offsets[mid] ?? 0;
    const next = offsets[mid + 1] ?? Number.MAX_SAFE_INTEGER;
    if (offset >= current && offset < next) {
      return mid + 1;
    }

    if (offset < current) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return offsets.length;
}

function coverageParseError(cwd: string, absolutePath: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not parse coverage report at ${normalizeArtifactPath(cwd, absolutePath)}: ${message}`;
}

function coverageEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Coverage command passed.";
  }

  if (execution.status === "skipped") {
    return "Coverage command was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Coverage command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Coverage command timed out.";
  }

  if (execution.status === "error") {
    return `Coverage command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Coverage command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function coverageFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Coverage command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Coverage command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return coverageEvidenceSummaryFromExecution(execution);
}

export function resolveCoverageDisplayCommand(options: Pick<CoverageHarnessOptions, "command">): string {
  return options.command ?? "collect coverage artifacts";
}

function validateCoverageOptions(options: CoverageHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Coverage command");
  }

  if (options.reportPaths !== undefined) {
    if (options.reportPaths.length === 0) {
      throw new Error("Coverage reportPaths must contain at least one path.");
    }

    for (const reportPath of options.reportPaths) {
      validateNonEmptyString(reportPath, "Coverage reportPath");
    }
  }

  if (options.failOn !== undefined && !isCodeDecayCoverageFailOn(options.failOn)) {
    throw new Error("Coverage failOn must be none or uncovered.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Coverage timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Coverage outputLimit must be a positive integer.");
  }
}

function validateCoveragePlan(plan: HarnessPlan): void {
  if (plan.harnessName !== COVERAGE_HARNESS_NAME) {
    throw new Error(`Coverage harness cannot run plan for ${plan.harnessName}.`);
  }
}

function isCodeDecayCoverageFailOn(value: string): value is CodeDecayCoverageFailOn {
  return value === "none" || value === "uncovered";
}
