import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
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
import { detectDuplicateAddedLogic } from "./duplicates/added-logic";
import { createRiskyAreaFinding, firstLine } from "./findings/builders";
import { dedupeFindings } from "./findings/sorting";
import { analyzeFunctions } from "./functions/metrics";
import { buildReverseImportGraph, findReverseImportChains } from "./imports/graph";
import { detectRoutesForFile, mergeImpactedRoutes } from "./routes/impact";
import { analyzeRuntimeCoverage } from "./runtime-coverage";
import { analyzeTestRecommendations } from "./tests/recommendations";
import { detectWeakTests } from "./tests/weak-audit";

export interface AnalyzeJsOptions {
  rootDir: string;
  changedFiles: FileChange[];
}

interface PropagatedRouteImpactAnalysis {
  impactedRoutes: ImpactedRoute[];
  findings: Finding[];
  recommendedTests: string[];
}

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

  const testRecommendations = analyzeTestRecommendations({
    rootDir: options.rootDir,
    changedSourceFiles,
    changedTestFiles,
    fullyCoveredSourcePaths
  });
  findings.push(...testRecommendations.findings);
  recommendedTests.push(...testRecommendations.recommendedTests);

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

function readChangedFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}
