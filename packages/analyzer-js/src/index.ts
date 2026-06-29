import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
  FileChange,
  Finding,
  ImpactedRoute,
  ImpactedArea
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import {
  classifyChange,
  isSourcePath,
  isTestPath
} from "./classifiers/paths";
import { detectFunctionMetricFindings } from "./decay/function-findings";
import { detectFragilePatterns } from "./decay/fragile-patterns";
import { detectDuplicateAddedLogic } from "./duplicates/added-logic";
import { createRiskyAreaFinding, firstLine } from "./findings/builders";
import { dedupeFindings } from "./findings/sorting";
import { buildReverseImportGraph, findReverseImportChains } from "./imports/graph";
import { detectRoutesForFile, mergeImpactedRoutes } from "./routes/impact";
import { analyzeRuntimeCoverage } from "./runtime-coverage";
import { detectBroadUnrelatedChanges } from "./scope/broad-change";
import { detectTestBloat } from "./tests/bloat";
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
  findings.push(...detectFunctionMetricFindings(options.rootDir, changedSourceFiles));

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

function readChangedFile(rootDir: string, path: string): string | undefined {
  try {
    return readFileSync(join(rootDir, path), "utf8");
  } catch {
    return undefined;
  }
}
