import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { parse } from "@babel/parser";
import type {
  AnalyzerResult,
  ChangedSourceCoverage,
  ChangedLine,
  FileChange,
  Finding,
  ImpactedRoute,
  ImpactedArea,
  RiskLevel,
  RuntimeCoverageSourceKind,
  TestEvidenceSource,
  TestEvidenceSummary
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
import {
  createMissingNearbyTestsFinding,
  createRiskyAreaFinding,
  firstLine
} from "./findings/builders";
import { dedupeFindings } from "./findings/sorting";

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

interface RuntimeCoverageAnalysis {
  findings: Finding[];
  recommendedTests: string[];
  testEvidence: TestEvidenceSummary;
}

interface PropagatedRouteImpactAnalysis {
  impactedRoutes: ImpactedRoute[];
  findings: Finding[];
  recommendedTests: string[];
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

const SOURCE_EXTENSION_CANDIDATES = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".next", "build"]);
const ASSERTION_PATTERN =
  /\b(expect|assert|strictEqual|deepStrictEqual|ok)\s*\(|\bshould\(|\bto(Be|Equal|StrictEqual|Contain|Match|Have|Throw|BeTruthy|BeFalsy)\b/;
const SNAPSHOT_ASSERTION_PATTERN = /\b(toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot)\s*\(/;
const MOCK_PATTERN =
  /\b(jest\.mock|vi\.mock|sinon\.stub|sinon\.mock|mockResolvedValue|mockRejectedValue|mockReturnValue|mockImplementation|createMock|mockFn)\b/;
const TEST_CASE_PATTERN = /\b(it|test|specify)\s*\(/;
const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
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

function detectRoutesForFile(path: string, content: string): ImpactedRoute[] {
  return [...detectNextjsRoute({ path }, content), ...detectNodeRoutes({ path }, content)];
}

function detectNextjsRoute(change: { path: string }, content: string): ImpactedRoute[] {
  const normalized = normalizePath(change.path);
  const withoutSrc = normalized.replace(/^src\//, "");

  if (/^middleware\.(js|ts)$/.test(withoutSrc)) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "middleware",
        route: "/",
        methods: ["*"],
        file: change.path,
        risk: "high",
        reasons: ["Next.js middleware changed"]
      })
    ];
  }

  const appApiMatch = /^app\/api\/(.+)\/route\.(js|ts)$/.exec(withoutSrc);
  if (appApiMatch?.[1]) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "api-route",
        route: `/api/${normalizeRouteSegments(appApiMatch[1])}`,
        methods: findExportedHttpMethods(content),
        file: change.path,
        risk: "high",
        reasons: ["Next.js App Router API route changed"]
      })
    ];
  }

  const appPageMatch = /^app\/(.+)\/page\.(js|jsx|ts|tsx)$/.exec(withoutSrc);
  if (appPageMatch?.[1]) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "ui-route",
        route: `/${normalizeRouteSegments(appPageMatch[1])}`,
        methods: [],
        file: change.path,
        risk: "medium",
        reasons: ["Next.js App Router UI route changed"]
      })
    ];
  }

  const pagesApiMatch = /^pages\/api\/(.+)\.(js|ts)$/.exec(withoutSrc);
  if (pagesApiMatch?.[1]) {
    return [
      routeImpact({
        framework: "nextjs",
        kind: "api-route",
        route: `/api/${normalizeRouteSegments(pagesApiMatch[1])}`,
        methods: ["*"],
        file: change.path,
        risk: "high",
        reasons: ["Next.js Pages API route changed"]
      })
    ];
  }

  return [];
}

function detectNodeRoutes(change: { path: string }, content: string): ImpactedRoute[] {
  if (!isNodeRouteCandidate(change.path)) {
    return [];
  }

  const routes: ImpactedRoute[] = [];
  const methodAlternation = HTTP_METHODS.map((method) => method.toLowerCase()).join("|");
  const methodCallPattern = new RegExp(`\\b(app|router|server|fastify)\\.(${methodAlternation})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, "gi");
  let match: RegExpExecArray | null;

  while ((match = methodCallPattern.exec(content)) !== null) {
    const receiver = match[1]?.toLowerCase();
    const method = match[2]?.toUpperCase() as HttpMethod | undefined;
    const route = match[3];
    if (!receiver || !method || !route) {
      continue;
    }

    const framework = receiver === "fastify" || receiver === "server" ? "fastify" : "express";

    routes.push(
      routeImpact({
        framework,
        kind: "route-handler",
        route,
        methods: [method],
        file: change.path,
        risk: "high",
        reasons: [`${framework === "fastify" ? "Fastify" : "Express"} route handler changed`]
      })
    );
  }

  routes.push(...detectFastifyRouteObjects(change, content));

  return routes;
}

function detectFastifyRouteObjects(change: { path: string }, content: string): ImpactedRoute[] {
  const routes: ImpactedRoute[] = [];
  const routeObjectPattern = /\b(?:server|fastify)\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = routeObjectPattern.exec(content)) !== null) {
    const body = match[1] ?? "";
    const url = /(?:url|path)\s*:\s*['"`]([^'"`]+)['"`]/i.exec(body)?.[1];
    if (!url) {
      continue;
    }

    const methods = extractRouteObjectMethods(body);
    routes.push(
      routeImpact({
        framework: "fastify",
        kind: "route-handler",
        route: url,
        methods,
        file: change.path,
        risk: "high",
        reasons: ["Fastify route object changed"]
      })
    );
  }

  return routes;
}

function routeImpact(input: {
  framework: ImpactedRoute["framework"];
  kind: ImpactedRoute["kind"];
  route: string;
  methods: string[];
  file: string;
  risk: RiskLevel;
  reasons: string[];
}): ImpactedRoute {
  return {
    framework: input.framework,
    kind: input.kind,
    route: normalizeRoute(input.route),
    methods: dedupeStrings(input.methods.map((method) => method.toUpperCase())),
    files: [input.file],
    risk: input.risk,
    reasons: input.reasons,
    recommendedTests: [`Add or run tests covering ${input.file}`]
  };
}

function mergeImpactedRoutes(routes: ImpactedRoute[]): ImpactedRoute[] {
  const byKey = new Map<string, ImpactedRoute>();

  for (const route of routes) {
    const key = `${route.framework}:${route.kind}:${route.route}:${route.methods.join(",")}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        ...route,
        files: [...route.files],
        reasons: [...route.reasons],
        recommendedTests: [...route.recommendedTests]
      });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
    existing.risk = higherRisk(existing.risk, route.risk);
    existing.recommendedTests = dedupeStrings([...existing.recommendedTests, ...route.recommendedTests]);
  }

  return [...byKey.values()];
}

function higherRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const score = (value: RiskLevel): number => (value === "high" ? 3 : value === "medium" ? 2 : 1);
  return score(left) >= score(right) ? left : right;
}

function findExportedHttpMethods(content: string): string[] {
  const methods = HTTP_METHODS.filter((method) => new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${method}\\b|\\bexport\\s+const\\s+${method}\\b`).test(content));
  return methods.length > 0 ? methods : ["*"];
}

function extractRouteObjectMethods(body: string): string[] {
  const methodValue = findObjectPropertyValue(body, "method");
  if (!methodValue) {
    return ["*"];
  }

  if (methodValue.kind === "array") {
    const methods = extractQuotedHttpMethods(methodValue.value);
    return methods.length > 0 ? methods : ["*"];
  }

  const method = methodValue.value.toUpperCase();
  if (HTTP_METHODS.includes(method as HttpMethod)) {
    return [method];
  }

  return ["*"];
}

function isNodeRouteCandidate(path: string): boolean {
  if (!isSourcePath(path) || isTestPath(path)) {
    return false;
  }

  return /(^|\/)(src\/)?(routes?|api|controllers?)(\/|$)|(^|\/)(server|app)\.(js|ts)$/i.test(path);
}

function normalizeRouteSegments(path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment))
    .map((segment) => (segment === "index" ? "" : segment))
    .filter((segment) => segment.length > 0);

  return segments.join("/");
}

function normalizeRoute(route: string): string {
  const normalized = `/${route}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized.length === 0 ? "/" : normalized;
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

function analyzeRuntimeCoverage(rootDir: string, changedSourceFiles: FileChange[]): RuntimeCoverageAnalysis {
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

    const content = readChangedFile(rootDir, normalizedPath);
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

function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      if (!isFunctionNode(node) || !node.loc) {
        return;
      }

      const startLine = node.loc.start.line;
      const endLine = node.loc.end.line;
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

function walk(node: unknown, visitor: (node: any) => void): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visitor);
    }
    return;
  }

  const typedNode = node as Record<string, unknown>;
  visitor(typedNode);

  for (const [key, value] of Object.entries(typedNode)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "extra" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }

    if (value && typeof value === "object") {
      walk(value, visitor);
    }
  }
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

function getNodeType(node: any): string | undefined {
  return typeof node?.type === "string" ? node.type : undefined;
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

function buildReverseImportGraph(rootDir: string): Map<string, string[]> {
  const repoSourceFiles = listRepoFiles(rootDir)
    .map((file) => normalizePath(file))
    .filter((file) => isSourcePath(file) && !isTestPath(file));
  const repoSourceSet = new Set(repoSourceFiles);
  const importersBySource = new Map<string, Set<string>>();

  for (const file of repoSourceFiles) {
    const content = readChangedFile(rootDir, file);
    if (!content) {
      continue;
    }

    for (const specifier of extractLocalImportSpecifiers(content)) {
      const resolved = resolveLocalImportSpecifier(file, specifier, repoSourceSet);
      if (!resolved) {
        continue;
      }

      const importers = importersBySource.get(resolved) ?? new Set<string>();
      importers.add(file);
      importersBySource.set(resolved, importers);
    }
  }

  return new Map(
    [...importersBySource.entries()].map(([source, importers]) => [source, [...importers].sort((left, right) => left.localeCompare(right))])
  );
}

function extractLocalImportSpecifiers(content: string): string[] {
  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });
    const specifiers = new Set<string>();

    walk(ast, (node) => {
      const type = getNodeType(node);
      if (
        (type === "ImportDeclaration" || type === "ExportNamedDeclaration" || type === "ExportAllDeclaration") &&
        typeof node.source?.value === "string" &&
        node.source.value.startsWith(".")
      ) {
        specifiers.add(node.source.value);
      }

      if (
        type === "CallExpression" &&
        getNodeType(node.callee) === "Identifier" &&
        node.callee.name === "require" &&
        Array.isArray(node.arguments) &&
        typeof node.arguments[0]?.value === "string" &&
        node.arguments[0].value.startsWith(".")
      ) {
        specifiers.add(node.arguments[0].value);
      }

      if (type === "ImportExpression" && typeof node.source?.value === "string" && node.source.value.startsWith(".")) {
        specifiers.add(node.source.value);
      }
    });

    return [...specifiers];
  } catch {
    return [];
  }
}

function resolveLocalImportSpecifier(importerPath: string, specifier: string, repoSourceSet: Set<string>): string | undefined {
  const relativeTarget = normalizePath(join(dirname(importerPath), specifier));
  const candidates = new Set<string>();
  candidates.add(relativeTarget);

  if (!extname(relativeTarget)) {
    for (const extension of SOURCE_EXTENSION_CANDIDATES) {
      candidates.add(`${relativeTarget}${extension}`);
      candidates.add(`${relativeTarget}/index${extension}`);
    }
  }

  for (const candidate of candidates) {
    if (repoSourceSet.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function findReverseImportChains(sourcePath: string, reverseImportGraph: Map<string, string[]>): string[][] {
  const queue: string[][] = [[sourcePath]];
  const visited = new Set<string>([sourcePath]);
  const chains: string[][] = [];

  while (queue.length > 0 && chains.length < 24) {
    const chain = queue.shift();
    if (!chain) {
      continue;
    }

    const current = chain.at(-1);
    if (!current) {
      continue;
    }

    for (const importer of reverseImportGraph.get(current) ?? []) {
      if (chain.includes(importer) || chain.length >= 6) {
        continue;
      }

      const nextChain = [...chain, importer];
      chains.push(nextChain);

      if (!visited.has(importer)) {
        visited.add(importer);
        queue.push(nextChain);
      }
    }
  }

  return chains;
}

function listRepoFiles(rootDir: string): string[] {
  const files: string[] = [];

  function visit(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) {
        continue;
      }

      const absolutePath = join(currentDir, entry);
      let stats;
      try {
        stats = statSync(absolutePath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        visit(absolutePath);
      } else {
        files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
      }
    }
  }

  visit(rootDir);
  return files;
}

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}

function normalizeCodeLine(line: string): string {
  return replaceQuotedStrings(collapseWhitespace(stripLineComment(line.trim())));
}

function findObjectPropertyValue(
  body: string,
  propertyName: string
): { kind: "array" | "string"; value: string } | undefined {
  const lowerBody = body.toLowerCase();
  const lowerPropertyName = propertyName.toLowerCase();
  let searchFrom = 0;

  while (searchFrom < body.length) {
    const propertyIndex = lowerBody.indexOf(lowerPropertyName, searchFrom);
    if (propertyIndex === -1) {
      return undefined;
    }

    searchFrom = propertyIndex + lowerPropertyName.length;

    if (isIdentifierCharacter(body.charAt(propertyIndex - 1)) || isIdentifierCharacter(body.charAt(searchFrom))) {
      continue;
    }

    let cursor = skipWhitespace(body, searchFrom);
    if (body[cursor] !== ":") {
      continue;
    }

    cursor = skipWhitespace(body, cursor + 1);
    const current = body[cursor];

    if (current === "[") {
      const end = findClosingArrayBracket(body, cursor);
      if (end !== -1) {
        return { kind: "array", value: body.slice(cursor + 1, end) };
      }
    }

    if (isQuote(current)) {
      const quoted = readQuotedValue(body, cursor);
      if (quoted) {
        return { kind: "string", value: quoted.value };
      }
    }
  }

  return undefined;
}

function extractQuotedHttpMethods(value: string): string[] {
  const methods: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (!isQuote(value[cursor])) {
      cursor += 1;
      continue;
    }

    const quoted = readQuotedValue(value, cursor);
    if (!quoted) {
      cursor += 1;
      continue;
    }

    const method = quoted.value.toUpperCase();
    if (HTTP_METHODS.includes(method as HttpMethod)) {
      methods.push(method);
    }

    cursor = quoted.endIndex + 1;
  }

  return dedupeStrings(methods);
}

function findClosingArrayBracket(value: string, startIndex: number): number {
  let depth = 0;
  let cursor = startIndex;

  while (cursor < value.length) {
    const current = value[cursor];
    if (isQuote(current)) {
      const quoted = readQuotedValue(value, cursor);
      cursor = quoted ? quoted.endIndex + 1 : cursor + 1;
      continue;
    }

    if (current === "[") {
      depth += 1;
    } else if (current === "]") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  return -1;
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

function skipWhitespace(value: string, startIndex: number): number {
  let cursor = startIndex;
  while (cursor < value.length && isWhitespace(value[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function isIdentifierCharacter(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    value === "_" ||
    value === "$"
  );
}

function isQuote(value: string | undefined): boolean {
  return value === "\"" || value === "'" || value === "`";
}

function isWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}
