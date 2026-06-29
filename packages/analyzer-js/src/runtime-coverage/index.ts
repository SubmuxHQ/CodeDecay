import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  ChangedSourceCoverage,
  FileChange,
  Finding,
  RiskLevel,
  RuntimeCoverageSourceKind,
  TestEvidenceSource,
  TestEvidenceSummary
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { classifyPath } from "../classifiers/paths";

interface RuntimeCoverageLineMapEntry {
  measured: Set<number>;
  covered: Set<number>;
  sourceKinds: Set<RuntimeCoverageSourceKind>;
  sourcePaths: Set<string>;
}

interface RuntimeCoverageData {
  sources: TestEvidenceSource[];
  linesByFile: Map<string, RuntimeCoverageLineMapEntry>;
}

export interface RuntimeCoverageAnalysis {
  findings: Finding[];
  recommendedTests: string[];
  testEvidence: TestEvidenceSummary;
}

export function analyzeRuntimeCoverage(rootDir: string, changedSourceFiles: FileChange[]): RuntimeCoverageAnalysis {
  const coverageData = loadRuntimeCoverageData(rootDir);
  const changedSources = changedSourceFiles.map((change) => classifyChangedSourceCoverage(change, coverageData.linesByFile.get(change.path)));
  const findings: Finding[] = [];
  const recommendedTests: string[] = [];

  for (const entry of changedSources) {
    const classification = classifyPath(entry.path);
    const severity: RiskLevel = classification?.risk === "high" ? "high" : "medium";
    const uncoveredLines = entry.uncoveredLines.join(", ");

    if (entry.status === "not_covered") {
      findings.push({
        ruleId: "runtime-coverage-miss",
        title: "Changed source not executed by runtime coverage",
        description: `${entry.path} has measured changed lines with zero runtime execution in available coverage artifacts.`,
        severity,
        category: "coverage",
        file: entry.path,
        line: entry.measuredLines[0]
      });
      recommendedTests.push(`Run or add tests that execute the changed lines in ${entry.path}.`);
    }

    if (entry.status === "partial") {
      findings.push({
        ruleId: "runtime-coverage-partial",
        title: "Changed source only partially executed by runtime coverage",
        description: `${entry.path} has uncovered changed lines${uncoveredLines ? ` (${uncoveredLines})` : ""} in available coverage artifacts.`,
        severity: classification?.risk === "high" ? "high" : "medium",
        category: "coverage",
        file: entry.path,
        line: entry.uncoveredLines[0] ?? entry.measuredLines[0]
      });
      recommendedTests.push(`Add runtime coverage for uncovered changed lines in ${entry.path}.`);
    }
  }

  return {
    findings,
    recommendedTests,
    testEvidence: {
      mode: coverageData.sources.length > 0 ? "runtime_augmented" : "heuristic_only",
      sources: coverageData.sources,
      changedSources,
      notes: buildRuntimeCoverageNotes(coverageData.sources, changedSources)
    }
  };
}

function loadRuntimeCoverageData(rootDir: string): RuntimeCoverageData {
  const sources: TestEvidenceSource[] = [];
  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();

  for (const artifact of findCoverageArtifacts(rootDir)) {
    const artifactLines =
      artifact.kind === "istanbul"
        ? readIstanbulCoverage(rootDir, artifact.absolutePath)
        : artifact.kind === "lcov"
          ? readLcovCoverage(rootDir, artifact.absolutePath)
          : readV8Coverage(rootDir, artifact.absolutePath);

    if (artifactLines.size === 0) {
      continue;
    }

    sources.push({
      kind: artifact.kind,
      path: artifact.relativePath
    });

    for (const [path, lines] of artifactLines) {
      mergeRuntimeCoverageEntry(linesByFile, path, lines);
    }
  }

  return {
    sources: dedupeCoverageSources(sources),
    linesByFile
  };
}

function classifyChangedSourceCoverage(
  change: FileChange,
  entry: RuntimeCoverageLineMapEntry | undefined
): ChangedSourceCoverage {
  const changedLines = dedupeNumbers(change.addedLines.map((line) => line.line));

  if (!entry) {
    return {
      path: change.path,
      status: "not_measured",
      measuredLines: [],
      coveredLines: [],
      uncoveredLines: [],
      sourceKinds: [],
      sourcePaths: []
    };
  }

  const measuredLines = changedLines.filter((line) => entry.measured.has(line));
  const coveredLines = measuredLines.filter((line) => entry.covered.has(line));
  const uncoveredLines = measuredLines.filter((line) => !entry.covered.has(line));
  const status =
    measuredLines.length === 0
      ? "not_measured"
      : coveredLines.length === 0
        ? "not_covered"
        : coveredLines.length < measuredLines.length
          ? "partial"
          : "covered";

  return {
    path: change.path,
    status,
    measuredLines,
    coveredLines,
    uncoveredLines,
    sourceKinds: dedupeStrings([...entry.sourceKinds]) as RuntimeCoverageSourceKind[],
    sourcePaths: dedupeStrings([...entry.sourcePaths])
  };
}

function buildRuntimeCoverageNotes(
  sources: TestEvidenceSource[],
  changedSources: ChangedSourceCoverage[]
): string[] {
  if (sources.length === 0) {
    return ["No runtime coverage artifact was found. Test audit remains heuristic-only."];
  }

  const notMeasured = changedSources.filter((entry) => entry.status === "not_measured").map((entry) => entry.path);
  if (notMeasured.length === 0) {
    return ["Runtime coverage artifacts were found for the changed source files."];
  }

  return [`Runtime coverage artifacts were found, but some changed paths were not measured: ${notMeasured.join(", ")}.`];
}

function mergeRuntimeCoverageEntry(
  target: Map<string, RuntimeCoverageLineMapEntry>,
  path: string,
  entry: RuntimeCoverageLineMapEntry
): void {
  const existing =
    target.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<RuntimeCoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies RuntimeCoverageLineMapEntry);

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

function dedupeCoverageSources(sources: TestEvidenceSource[]): TestEvidenceSource[] {
  const seen = new Set<string>();
  const deduped: TestEvidenceSource[] = [];

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

function findCoverageArtifacts(
  rootDir: string
): Array<{ kind: RuntimeCoverageSourceKind; absolutePath: string; relativePath: string }> {
  const discovered = new Map<string, { kind: RuntimeCoverageSourceKind; absolutePath: string; relativePath: string }>();
  const explicitCandidates: Array<{ kind: RuntimeCoverageSourceKind; absolutePath: string }> = [
    { kind: "istanbul", absolutePath: join(rootDir, "coverage", "coverage-final.json") },
    { kind: "istanbul", absolutePath: join(rootDir, "coverage-final.json") },
    { kind: "lcov", absolutePath: join(rootDir, "coverage", "lcov.info") },
    { kind: "lcov", absolutePath: join(rootDir, "lcov.info") }
  ];

  for (const candidate of explicitCandidates) {
    if (existsSync(candidate.absolutePath)) {
      discovered.set(candidate.absolutePath, {
        ...candidate,
        relativePath: relative(rootDir, candidate.absolutePath).replaceAll("\\", "/")
      });
    }
  }

  for (const directory of ["coverage", ".v8-coverage", ".nyc_output"]) {
    const absoluteDir = join(rootDir, directory);
    if (!existsSync(absoluteDir)) {
      continue;
    }

    for (const file of listCoverageFiles(rootDir, absoluteDir)) {
      const kind = detectCoverageArtifactKind(file);
      if (!kind) {
        continue;
      }

      discovered.set(file, {
        kind,
        absolutePath: file,
        relativePath: relative(rootDir, file).replaceAll("\\", "/")
      });
    }
  }

  return [...discovered.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function listCoverageFiles(rootDir: string, currentDir: string): string[] {
  const files: string[] = [];
  const relativeDir = relative(rootDir, currentDir).replaceAll("\\", "/");
  if (relativeDir.startsWith("..")) {
    return files;
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCoverageFiles(rootDir, absolutePath));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function detectCoverageArtifactKind(absolutePath: string): RuntimeCoverageSourceKind | undefined {
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

function readIstanbulCoverage(rootDir: string, absolutePath: string): Map<string, RuntimeCoverageLineMapEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return new Map();
  }

  if (!isPlainObject(parsed)) {
    return new Map();
  }

  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();
  for (const [rawPath, value] of Object.entries(parsed)) {
    if (!isPlainObject(value)) {
      continue;
    }

    const normalizedPath = normalizeCoveragePath(rootDir, rawPath);
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

        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", absolutePath);
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
        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", absolutePath);
      }
    }
  }

  return linesByFile;
}

function readLcovCoverage(rootDir: string, absolutePath: string): Map<string, RuntimeCoverageLineMapEntry> {
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch {
    return new Map();
  }

  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();
  let currentFile: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = normalizeCoveragePath(rootDir, line.slice(3).trim());
      continue;
    }

    if (line.startsWith("DA:") && currentFile) {
      const [rawLine, rawCount] = line.slice(3).split(",");
      const lineNumber = Number(rawLine);
      const count = Number(rawCount);
      if (!Number.isInteger(lineNumber) || Number.isNaN(count)) {
        continue;
      }

      addCoverageLine(linesByFile, currentFile, lineNumber, count > 0, "lcov", absolutePath);
      continue;
    }

    if (line === "end_of_record") {
      currentFile = undefined;
    }
  }

  return linesByFile;
}

function readV8Coverage(rootDir: string, absolutePath: string): Map<string, RuntimeCoverageLineMapEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return new Map();
  }

  const scripts = extractV8Scripts(parsed);
  if (scripts.length === 0) {
    return new Map();
  }

  const linesByFile = new Map<string, RuntimeCoverageLineMapEntry>();
  for (const script of scripts) {
    const normalizedPath = normalizeCoveragePath(rootDir, script.url);
    if (!normalizedPath) {
      continue;
    }

    const content = readCoverageSourceFile(rootDir, normalizedPath);
    if (!content) {
      continue;
    }

    const lineOffsets = createLineOffsets(content);
    for (const range of script.ranges) {
      const startLine = lineNumberForOffset(lineOffsets, range.startOffset);
      const endLine = lineNumberForOffset(lineOffsets, Math.max(range.startOffset, range.endOffset - 1));
      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, range.count > 0, "v8", absolutePath);
      }
    }
  }

  return linesByFile;
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
  linesByFile: Map<string, RuntimeCoverageLineMapEntry>,
  path: string,
  line: number,
  covered: boolean,
  sourceKind: RuntimeCoverageSourceKind,
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
      sourceKinds: new Set<RuntimeCoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies RuntimeCoverageLineMapEntry);

  entry.measured.add(line);
  if (covered) {
    entry.covered.add(line);
  }
  entry.sourceKinds.add(sourceKind);
  entry.sourcePaths.add(normalizePath(sourcePath));
  linesByFile.set(path, entry);
}

function normalizeCoveragePath(rootDir: string, rawPath: string): string | undefined {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return undefined;
  }

  const normalizedInput = normalizePath(rawPath.trim().replace(/^file:\/\//, ""));
  if (normalizedInput.includes("://")) {
    return undefined;
  }

  if (normalizedInput.startsWith("/")) {
    const relativePath = relative(rootDir, normalizedInput).replaceAll("\\", "/");
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

function readCoverageSourceFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
