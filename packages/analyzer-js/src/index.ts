import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parse } from "@babel/parser";
import type {
  AnalyzerResult,
  ChangedLine,
  FileChange,
  Finding,
  ImpactedRoute,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import {
  classifyChange,
  classifyPath,
  isLowSignalChange,
  isSourcePath,
  isTestPath,
  type AreaKind
} from "./classifiers/paths";
import { getNodeType, walk } from "./ast/traverse";
import { listRepoFiles } from "./files/repo";
import {
  createMissingNearbyTestsFinding,
  createRiskyAreaFinding,
  firstLine
} from "./findings/builders";
import { dedupeFindings } from "./findings/sorting";
import { buildReverseImportGraph, findReverseImportChains } from "./imports/graph";
import { detectRoutesForFile, mergeImpactedRoutes } from "./routes/impact";
import { analyzeRuntimeCoverage } from "./runtime-coverage";

export interface AnalyzeJsOptions {
  rootDir: string;
  changedFiles: FileChange[];
}

interface FunctionMetric {
  file: string;
  line: number;
  name: string;
  lines: number;
  complexity: number;
}

interface TestAuditResult {
  findings: Finding[];
  recommendedTests: string[];
}

interface PropagatedRouteImpactAnalysis {
  impactedRoutes: ImpactedRoute[];
  findings: Finding[];
  recommendedTests: string[];
}

const ASSERTION_PATTERN =
  /\b(expect|assert|strictEqual|deepStrictEqual|ok)\s*\(|\bshould\(|\bto(Be|Equal|StrictEqual|Contain|Match|Have|Throw|BeTruthy|BeFalsy)\b/;
const SNAPSHOT_ASSERTION_PATTERN = /\b(toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot)\s*\(/;
const MOCK_PATTERN =
  /\b(jest\.mock|vi\.mock|sinon\.stub|sinon\.mock|mockResolvedValue|mockRejectedValue|mockReturnValue|mockImplementation|createMock|mockFn)\b/;
const TEST_CASE_PATTERN = /\b(it|test|specify)\s*\(/;
const GENERIC_SOURCE_STEMS = new Set(["index", "main", "app", "page", "route", "layout", "config"]);
export function analyzeJsProject(options: AnalyzeJsOptions): AnalyzerResult {
  const findings: Finding[] = [];
  const impactedAreas: ImpactedArea[] = [];
  const impactedRoutes: ImpactedRoute[] = [];
  const recommendedTests: string[] = [];
  const changedSourceFiles = options.changedFiles.filter(
    (change) => isSourcePath(change.path) && change.status !== "deleted" && !isTestPath(change.path)
  );
  const changedTestFiles = options.changedFiles.filter((change) => isTestPath(change.path));
  const runtimeCoverage = analyzeRuntimeCoverage(options.rootDir, changedSourceFiles);
  const reverseImportGraph = buildReverseImportGraph(options.rootDir);
  const fullyCoveredSourcePaths = new Set(
    runtimeCoverage.testEvidence.changedSources.filter((entry) => entry.status === "covered").map((entry) => entry.path)
  );

  for (const change of options.changedFiles) {
    const classification = classifyChange(change);
    if (classification) {
      impactedAreas.push({
        name: classification.name,
        kind: classification.kind,
        risk: classification.risk,
        files: [change.path]
      });

      findings.push(createRiskyAreaFinding(change, classification));
    }
  }

  impactedRoutes.push(...detectImpactedRoutes(options.rootDir, changedSourceFiles));
  const propagatedRouteImpacts = detectPropagatedRouteImpacts(options.rootDir, changedSourceFiles, reverseImportGraph);
  impactedRoutes.push(...propagatedRouteImpacts.impactedRoutes);
  findings.push(...propagatedRouteImpacts.findings);
  recommendedTests.push(...propagatedRouteImpacts.recommendedTests);

  if (changedSourceFiles.length > 0 && changedTestFiles.length === 0) {
    const riskySourceFiles = changedSourceFiles
      .filter((change) => classifyChange(change)?.risk !== "low")
      .filter((change) => !fullyCoveredSourcePaths.has(change.path));
    if (riskySourceFiles.length > 0) {
      findings.push(
        createMissingNearbyTestsFinding(
          riskySourceFiles,
          riskySourceFiles.some((change) => classifyChange(change)?.risk === "high") ? "high" : "medium"
        )
      );
    }
  }

  recommendedTests.push(...recommendTests(options.rootDir, changedSourceFiles));

  const broadChangeFinding = detectBroadUnrelatedChanges(options.changedFiles);
  if (broadChangeFinding) {
    findings.push(broadChangeFinding);
  }

  findings.push(...detectFragilePatterns(options.changedFiles));
  findings.push(...detectTestBloat(options.changedFiles, changedSourceFiles));
  findings.push(...detectDuplicateAddedLogic(options.changedFiles));
  findings.push(...runtimeCoverage.findings);
  recommendedTests.push(...runtimeCoverage.recommendedTests);

  const testAudit = detectWeakTests(options.rootDir, changedTestFiles, changedSourceFiles);
  findings.push(...testAudit.findings);
  recommendedTests.push(...testAudit.recommendedTests);

  for (const sourceChange of changedSourceFiles) {
    const content = readChangedFile(options.rootDir, sourceChange.path);
    if (!content) {
      continue;
    }

    const metrics = analyzeFunctions(sourceChange, content);
    for (const metric of metrics) {
      if (metric.lines >= 120) {
        findings.push({
          ruleId: "large-function",
          title: "Large changed function",
          description: `${metric.name} spans ${metric.lines} lines, which increases review and regression risk.`,
          severity: metric.lines >= 180 ? "high" : "medium",
          category: "decay",
          file: metric.file,
          line: metric.line
        });
      }

      if (metric.complexity >= 12) {
        findings.push({
          ruleId: "high-complexity",
          title: "High complexity in changed function",
          description: `${metric.name} has estimated cyclomatic complexity ${metric.complexity}.`,
          severity: metric.complexity >= 20 ? "high" : "medium",
          category: "decay",
          file: metric.file,
          line: metric.line
        });
      }
    }
  }

  return {
    findings: dedupeFindings(findings),
    impactedAreas,
    impactedRoutes: mergeImpactedRoutes(impactedRoutes),
    recommendedTests: recommendedTests.length > 0 ? dedupeStrings(recommendedTests) : ["Run the test suite for changed packages or apps."],
    testEvidence: runtimeCoverage.testEvidence
  };
}

function detectImpactedRoutes(rootDir: string, changedSourceFiles: FileChange[]): ImpactedRoute[] {
  return mergeImpactedRoutes(
    changedSourceFiles.flatMap((change) => {
      const content = readChangedFile(rootDir, change.path) ?? change.addedLines.map((line) => line.content).join("\n");

      return detectRoutesForFile(change.path, content);
    })
  );
}

function detectPropagatedRouteImpacts(
  rootDir: string,
  changedSourceFiles: FileChange[],
  reverseImportGraph: Map<string, string[]>
): PropagatedRouteImpactAnalysis {
  const impactedRoutes: ImpactedRoute[] = [];
  const findings: Finding[] = [];
  const recommendedTests: string[] = [];

  for (const change of changedSourceFiles) {
    const chains = findReverseImportChains(normalizePath(change.path), reverseImportGraph);

    for (const chain of chains) {
      const importerPath = chain.at(-1);
      if (!importerPath) {
        continue;
      }

      const content = readChangedFile(rootDir, importerPath);
      if (!content) {
        continue;
      }

      const routes = detectRoutesForFile(importerPath, content);
      if (routes.length === 0) {
        continue;
      }

      const chainLabel = chain.join(" -> ");
      for (const route of routes) {
        impactedRoutes.push({
          ...route,
          files: dedupeStrings([...route.files, change.path]),
          reasons: dedupeStrings([...route.reasons, `Propagated through local imports: ${chainLabel}`])
        });

        findings.push({
          ruleId: "propagated-route-impact",
          title: "Changed module flows into a route or API boundary",
          description: `${change.path} reaches ${route.route} through local import chain ${chainLabel}. Review the full user-facing or API boundary, not only the changed helper.`,
          severity: route.risk,
          category: "regression",
          file: change.path,
          line: firstLine(change)
        });

        recommendedTests.push(`Add or run tests covering ${importerPath} because it depends on ${change.path}`);
      }
    }
  }

  return {
    impactedRoutes: mergeImpactedRoutes(impactedRoutes),
    findings: dedupeFindings(findings),
    recommendedTests: dedupeStrings(recommendedTests)
  };
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function recommendTests(rootDir: string, sourceChanges: FileChange[]): string[] {
  if (sourceChanges.length === 0) {
    return [];
  }

  const repoFiles = listRepoFiles(rootDir);
  const testFiles = repoFiles.filter(isTestPath);
  const recommendations: string[] = [];

  for (const change of sourceChanges) {
    const sourceBase = stripExtension(basename(change.path));
    const sourceDir = dirname(change.path);
    const matches = testFiles.filter((testPath) => {
      const testBase = stripExtension(basename(testPath))
        .replace(/(\.|-|_)test$/i, "")
        .replace(/(\.|-|_)spec$/i, "");

      return (
        testBase.includes(sourceBase) ||
        sourceBase.includes(testBase) ||
        dirname(testPath).startsWith(sourceDir) ||
        sourceDir.startsWith(dirname(testPath))
      );
    });

    if (matches.length > 0) {
      recommendations.push(...matches.slice(0, 4));
    } else {
      recommendations.push(`Add or run tests covering ${change.path}`);
    }
  }

  return recommendations;
}

function detectBroadUnrelatedChanges(changedFiles: FileChange[]): Finding | undefined {
  const sourceFiles = changedFiles.filter((change) => !isLowSignalChange(change));
  if (sourceFiles.length === 0) {
    return undefined;
  }

  const topLevelGroups = new Set(sourceFiles.map((change) => change.path.split("/")[0] ?? change.path));
  const areaKinds = new Set(
    sourceFiles
      .map((change) => classifyPath(change.path)?.kind)
      .filter((kind): kind is AreaKind => Boolean(kind))
  );

  if (sourceFiles.length >= 12 || topLevelGroups.size >= 5 || areaKinds.size >= 5) {
    return {
      ruleId: "broad-unrelated-change",
      title: "Broad unrelated change set",
      description: `This PR changes ${sourceFiles.length} files across ${topLevelGroups.size} top-level areas and ${areaKinds.size} risk categories.`,
      severity: sourceFiles.length >= 20 || topLevelGroups.size >= 8 ? "high" : "medium",
      category: "scope"
    };
  }

  return undefined;
}

function detectFragilePatterns(changedFiles: FileChange[]): Finding[] {
  const findings: Finding[] = [];
  const patterns: Array<{ id: string; title: string; pattern: RegExp; severity: RiskLevel }> = [
    {
      id: "typescript-any",
      title: "New unchecked TypeScript escape hatch",
      pattern: /\b(as\s+any|:\s*any|<any>)/,
      severity: "medium"
    },
    {
      id: "compiler-suppression",
      title: "New compiler or linter suppression",
      pattern: /(@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore)/,
      severity: "medium"
    },
    {
      id: "silent-failure",
      title: "Potential silent failure path",
      pattern: /catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}|return\s+null\s*;?\s*\/\/\s*(ignore|fallback)/i,
      severity: "high"
    }
  ];

  for (const change of changedFiles.filter((file) => isSourcePath(file.path) && !isTestPath(file.path))) {
    for (const line of change.addedLines) {
      for (const pattern of patterns) {
        if (pattern.pattern.test(line.content)) {
          findings.push({
            ruleId: pattern.id,
            title: pattern.title,
            description: `${change.path} adds code that can hide type, lint, or runtime failures.`,
            severity: pattern.severity,
            category: "decay",
            file: change.path,
            line: line.line
          });
        }
      }
    }
  }

  return findings;
}

function detectTestBloat(changedFiles: FileChange[], changedSourceFiles: FileChange[]): Finding[] {
  const sourceAdditions = changedSourceFiles.reduce((sum, file) => sum + file.additions, 0);
  const findings: Finding[] = [];

  for (const change of changedFiles.filter((file) => isTestPath(file.path))) {
    const mockLines = change.addedLines.filter((line) =>
      /(jest\.mock|vi\.mock|sinon|mockResolvedValue|mockReturnValue|snapshot|toMatchSnapshot)/.test(line.content)
    );

    if (change.additions >= 120 || (change.additions >= 60 && change.additions > sourceAdditions * 2)) {
      findings.push({
        ruleId: "test-bloat",
        title: "Large test change relative to source change",
        description: `${change.path} adds ${change.additions} lines of tests for ${sourceAdditions} source additions.`,
        severity: change.additions >= 180 || mockLines.length >= 20 ? "high" : "medium",
        category: "decay",
        file: change.path,
        line: firstLine(change)
      });
    }

    if (mockLines.length >= 12) {
      findings.push({
        ruleId: "heavy-mocking",
        title: "Heavy mocking in changed tests",
        description: `${change.path} adds ${mockLines.length} mock or snapshot lines, which may weaken regression confidence.`,
        severity: "medium",
        category: "coverage",
        file: change.path,
        line: mockLines[0]?.line
      });
    }
  }

  return findings;
}

function detectWeakTests(rootDir: string, changedTestFiles: FileChange[], changedSourceFiles: FileChange[]): TestAuditResult {
  const findings: Finding[] = [];
  const recommendedTests: string[] = [];

  if (changedTestFiles.length === 0) {
    return { findings, recommendedTests };
  }

  const sourceProfiles = changedSourceFiles.map((change) => createSourceProfile(change));
  const sourceBlocks = createSourceLogicBlocks(changedSourceFiles);

  for (const testChange of changedTestFiles) {
    const content = readChangedFile(rootDir, testChange.path) ?? testChange.addedLines.map((line) => line.content).join("\n");
    const lines = content.split(/\r?\n/);
    const assertionLines = findLineMatches(lines, ASSERTION_PATTERN);
    const snapshotLines = findLineMatches(lines, SNAPSHOT_ASSERTION_PATTERN);
    const mockLines = findLineMatches(lines, MOCK_PATTERN);

    if (looksLikeRunnableTest(content) && assertionLines.length === 0) {
      findings.push({
        ruleId: "test-without-assertions",
        title: "Changed test has no assertions",
        description: `${testChange.path} defines test cases but does not appear to assert behavior.`,
        severity: "medium",
        category: "coverage",
        file: testChange.path,
        line: firstLine(testChange) ?? 1
      });
      recommendedTests.push(`Add real assertions to ${testChange.path}`);
    }

    if (snapshotLines.length > 0 && assertionLines.every((line) => SNAPSHOT_ASSERTION_PATTERN.test(line.content))) {
      findings.push({
        ruleId: "snapshot-only-test",
        title: "Snapshot-only changed test",
        description: `${testChange.path} appears to rely only on snapshot assertions, which can miss behavior regressions.`,
        severity: "medium",
        category: "coverage",
        file: testChange.path,
        line: snapshotLines[0]?.line
      });
      recommendedTests.push(`Add explicit behavior assertions to ${testChange.path}`);
    }

    const mockedSources = sourceProfiles.filter((profile) => referencesSourceProfile(mockLines.map((line) => line.content).join("\n"), profile));
    if (mockedSources.length > 0) {
      findings.push({
        ruleId: "mocked-changed-source",
        title: "Changed test mocks changed source",
        description: `${testChange.path} mocks changed source code instead of exercising the real behavior path.`,
        severity: "high",
        category: "coverage",
        file: testChange.path,
        line: mockLines[0]?.line
      });
      for (const source of mockedSources.slice(0, 3)) {
        recommendedTests.push(`Add an integration or real-module check for ${source.path}`);
      }
    }

    if (changedSourceFiles.length > 0 && !referencesAnyChangedSource(testChange, content, sourceProfiles)) {
      findings.push({
        ruleId: "unrelated-test-change",
        title: "Changed test does not reference changed source",
        description: `${testChange.path} changed, but it does not appear to exercise any changed source file.`,
        severity: "medium",
        category: "coverage",
        file: testChange.path,
        line: firstLine(testChange) ?? 1
      });
      recommendedTests.push(`Add or update tests that exercise ${changedSourceFiles[0]?.path ?? "the changed source"}`);
    }

    const copiedBlock = findCopiedImplementationBlock(lines, sourceBlocks);
    if (copiedBlock) {
      findings.push({
        ruleId: "copied-implementation-in-test",
        title: "Test appears to copy implementation logic",
        description: `${testChange.path} includes logic copied from ${copiedBlock.sourcePath}; this can make tests pass without protecting real behavior.`,
        severity: "high",
        category: "coverage",
        file: testChange.path,
        line: copiedBlock.testLine
      });
      recommendedTests.push(`Exercise ${copiedBlock.sourcePath} through its public API instead of copying its logic`);
    }

    if (assertionLines.length > 0 && changedSourceFiles.some((change) => classifyPath(change.path)?.risk !== "low")) {
      const contentLower = content.toLowerCase();
      const hasNegativeOrEdgeCase = /(invalid|missing|null|undefined|empty|error|fail|reject|unauthorized|forbidden|boundary|overflow|malformed)/.test(contentLower);
      if (!hasNegativeOrEdgeCase) {
        findings.push({
          ruleId: "happy-path-only-test",
          title: "Changed test looks happy-path only",
          description: `${testChange.path} has assertions but no obvious negative, malformed, or boundary case coverage for risky source changes.`,
          severity: "medium",
          category: "coverage",
          file: testChange.path,
          line: assertionLines[0]?.line
        });
        recommendedTests.push(`Add negative and edge-case coverage for ${changedSourceFiles[0]?.path ?? "the risky source change"}`);
      }
    }
  }

  return {
    findings,
    recommendedTests
  };
}

interface SourceProfile {
  path: string;
  dirname: string;
  basename: string;
  stem: string;
  importPath: string;
}

interface SourceLogicBlock {
  sourcePath: string;
  key: string;
}

interface CopiedImplementationBlock {
  sourcePath: string;
  testLine: number;
}

function createSourceProfile(change: FileChange): SourceProfile {
  const stem = stripExtension(basename(change.path));
  return {
    path: change.path,
    dirname: dirname(change.path),
    basename: basename(change.path),
    stem,
    importPath: stripExtension(change.path)
  };
}

function referencesAnyChangedSource(
  testChange: FileChange,
  content: string,
  sourceProfiles: SourceProfile[]
): boolean {
  return sourceProfiles.some((profile) => isNearbyTestForSource(testChange.path, profile) || referencesSourceProfile(content, profile));
}

function referencesSourceProfile(content: string, profile: SourceProfile): boolean {
  const normalized = content.replaceAll("\\", "/");
  const importPathWithoutSrc = profile.importPath.replace(/^src\//, "");
  const hasMeaningfulStem = !GENERIC_SOURCE_STEMS.has(profile.stem.toLowerCase());

  return (
    normalized.includes(profile.path) ||
    normalized.includes(profile.importPath) ||
    normalized.includes(importPathWithoutSrc) ||
    normalized.includes(profile.basename) ||
    (hasMeaningfulStem && new RegExp(`\\b${escapeRegExp(profile.stem)}\\b`, "i").test(normalized))
  );
}

function isNearbyTestForSource(testPath: string, profile: SourceProfile): boolean {
  const testDir = dirname(testPath);
  const testStem = stripExtension(basename(testPath))
    .replace(/(\.|-|_)test$/i, "")
    .replace(/(\.|-|_)spec$/i, "");

  return (
    testStem.includes(profile.stem) ||
    profile.stem.includes(testStem) ||
    testDir.startsWith(profile.dirname) ||
    profile.dirname.startsWith(testDir)
  );
}

function createSourceLogicBlocks(changedSourceFiles: FileChange[]): SourceLogicBlock[] {
  const blocks: SourceLogicBlock[] = [];

  for (const change of changedSourceFiles) {
    const normalizedLines = change.addedLines
      .map((line) => normalizeImplementationLine(line.content))
      .filter((line) => line.length >= 8);

    for (let index = 0; index <= normalizedLines.length - 3; index += 1) {
      const key = normalizedLines.slice(index, index + 3).join("\n");
      blocks.push({
        sourcePath: change.path,
        key
      });
    }
  }

  return blocks;
}

function findCopiedImplementationBlock(
  testLines: string[],
  sourceBlocks: SourceLogicBlock[]
): CopiedImplementationBlock | undefined {
  if (sourceBlocks.length === 0) {
    return undefined;
  }

  const normalizedTestLines = testLines
    .map((content, index) => ({
      line: index + 1,
      content: normalizeImplementationLine(content)
    }))
    .filter((line) => line.content.length >= 8);

  for (let index = 0; index <= normalizedTestLines.length - 3; index += 1) {
    const blockLines = normalizedTestLines.slice(index, index + 3);
    const key = blockLines.map((line) => line.content).join("\n");
    const match = sourceBlocks.find((sourceBlock) => sourceBlock.key === key);
    if (match) {
      return {
        sourcePath: match.sourcePath,
        testLine: blockLines[0]?.line ?? 1
      };
    }
  }

  return undefined;
}

function findLineMatches(lines: string[], pattern: RegExp): ChangedLine[] {
  return lines.flatMap((content, index) => (pattern.test(content) ? [{ line: index + 1, content }] : []));
}

function looksLikeRunnableTest(content: string): boolean {
  return TEST_CASE_PATTERN.test(content);
}

function normalizeImplementationLine(line: string): string {
  return normalizeCodeLine(line)
    .replace(/\b(expect|assert|test|it|describe)\b/g, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectDuplicateAddedLogic(changedFiles: FileChange[]): Finding[] {
  const blockMap = new Map<string, Array<{ file: string; line: number }>>();

  for (const change of changedFiles.filter((file) => isSourcePath(file.path) && !isTestPath(file.path))) {
    const normalizedLines = change.addedLines
      .map((line) => ({ line: line.line, content: normalizeCodeLine(line.content) }))
      .filter((line) => line.content.length >= 8);

    for (let index = 0; index <= normalizedLines.length - 4; index += 1) {
      const blockLines = normalizedLines.slice(index, index + 4);
      const key = blockLines.map((line) => line.content).join("\n");
      const firstLineNumber = blockLines[0]?.line ?? 1;
      const entries = blockMap.get(key) ?? [];
      entries.push({ file: change.path, line: firstLineNumber });
      blockMap.set(key, entries);
    }
  }

  const findings: Finding[] = [];
  for (const entries of blockMap.values()) {
    const uniqueFiles = new Set(entries.map((entry) => entry.file));
    if (uniqueFiles.size >= 2 || entries.length >= 3) {
      const first = entries[0];
      findings.push({
        ruleId: "duplicated-added-logic",
        title: "Duplicated added logic",
        description: `A similar block of added logic appears ${entries.length} times across ${uniqueFiles.size} file(s).`,
        severity: uniqueFiles.size >= 3 ? "high" : "medium",
        category: "decay",
        file: first?.file,
        line: first?.line
      });
    }
  }

  return findings.slice(0, 5);
}

function analyzeFunctions(change: FileChange, content: string): FunctionMetric[] {
  const changedLines = new Set(change.addedLines.map((line) => line.line));

  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });

    const metrics: FunctionMetric[] = [];
    walk(ast, (node) => {
      const loc = readNodeLoc(node);
      if (!isFunctionNode(node) || !loc) {
        return;
      }

      const startLine = loc.start.line;
      const endLine = loc.end.line;
      const touchesChangedLine =
        changedLines.size === 0 ||
        [...changedLines].some((line) => line >= startLine && line <= endLine);

      if (!touchesChangedLine) {
        return;
      }

      metrics.push({
        file: change.path,
        line: startLine,
        name: getFunctionName(node),
        lines: endLine - startLine + 1,
        complexity: estimateComplexity(node)
      });
    });

    return metrics;
  } catch {
    return [
      {
        file: change.path,
        line: firstLine(change) ?? 1,
        name: "unparsed source",
        lines: 0,
        complexity: 12
      }
    ];
  }
}

function estimateComplexity(node: unknown): number {
  let complexity = 1;
  walk(node, (child) => {
    const type = getNodeType(child);
    if (
      type === "IfStatement" ||
      type === "ForStatement" ||
      type === "ForInStatement" ||
      type === "ForOfStatement" ||
      type === "WhileStatement" ||
      type === "DoWhileStatement" ||
      type === "SwitchCase" ||
      type === "CatchClause" ||
      type === "ConditionalExpression"
    ) {
      complexity += 1;
    }

    if (type === "LogicalExpression" && (child.operator === "&&" || child.operator === "||")) {
      complexity += 1;
    }
  });

  return complexity;
}

function isFunctionNode(node: any): boolean {
  const type = getNodeType(node);
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression" ||
    type === "ObjectMethod" ||
    type === "ClassMethod" ||
    type === "ClassPrivateMethod"
  );
}

function readNodeLoc(node: unknown): { start: { line: number }; end: { line: number } } | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }

  const loc = (node as { loc?: unknown }).loc;
  if (!loc || typeof loc !== "object") {
    return undefined;
  }

  const start = (loc as { start?: unknown }).start;
  const end = (loc as { end?: unknown }).end;
  if (!start || !end || typeof start !== "object" || typeof end !== "object") {
    return undefined;
  }

  const startLine = (start as { line?: unknown }).line;
  const endLine = (end as { line?: unknown }).line;
  if (typeof startLine !== "number" || typeof endLine !== "number") {
    return undefined;
  }

  return {
    start: { line: startLine },
    end: { line: endLine }
  };
}

function getFunctionName(node: any): string {
  if (typeof node?.id?.name === "string") {
    return node.id.name;
  }

  if (typeof node?.key?.name === "string") {
    return node.key.name;
  }

  return "changed function";
}

function readChangedFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}

function normalizeCodeLine(line: string): string {
  return replaceQuotedStrings(collapseWhitespace(stripLineComment(line.trim())));
}

function readQuotedValue(value: string, startIndex: number): { value: string; endIndex: number } | undefined {
  const quote = value[startIndex];
  if (!isQuote(quote)) {
    return undefined;
  }

  let cursor = startIndex + 1;
  let result = "";

  while (cursor < value.length) {
    const current = value[cursor];
    if (current === "\\") {
      if (cursor + 1 < value.length) {
        result += value[cursor + 1];
        cursor += 2;
        continue;
      }
      break;
    }

    if (current === quote) {
      return { value: result, endIndex: cursor };
    }

    result += current;
    cursor += 1;
  }

  return undefined;
}

function stripLineComment(value: string): string {
  const commentIndex = value.indexOf("//");
  return commentIndex === -1 ? value : value.slice(0, commentIndex);
}

function collapseWhitespace(value: string): string {
  const parts: string[] = [];
  let previousWasWhitespace = false;

  for (const char of value) {
    if (isWhitespace(char)) {
      if (!previousWasWhitespace && parts.length > 0) {
        parts.push(" ");
      }
      previousWasWhitespace = true;
      continue;
    }

    parts.push(char);
    previousWasWhitespace = false;
  }

  if (parts.at(-1) === " ") {
    parts.pop();
  }

  return parts.join("");
}

function replaceQuotedStrings(value: string): string {
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (!isQuote(value[cursor])) {
      parts.push(value[cursor] ?? "");
      cursor += 1;
      continue;
    }

    const quoted = readQuotedValue(value, cursor);
    if (!quoted) {
      parts.push(value[cursor] ?? "");
      cursor += 1;
      continue;
    }

    parts.push("\"\"");
    cursor = quoted.endIndex + 1;
  }

  return parts.join("");
}

function isQuote(value: string | undefined): boolean {
  return value === "\"" || value === "'" || value === "`";
}

function isWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}
