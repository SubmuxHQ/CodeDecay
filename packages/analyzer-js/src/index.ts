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
import { createRiskyAreaFinding } from "./findings/builders";
import { dedupeFindings } from "./findings/sorting";
import { analyzeRouteImpacts } from "./routes/analysis";
import { mergeImpactedRoutes } from "./routes/impact";
import { analyzeRuntimeCoverage } from "./runtime-coverage";
import { detectBroadUnrelatedChanges } from "./scope/broad-change";
import { detectTestBloat } from "./tests/bloat";
import { analyzeTestRecommendations } from "./tests/recommendations";
import { detectWeakTests } from "./tests/weak-audit";

export interface AnalyzeJsOptions {
  rootDir: string;
  changedFiles: FileChange[];
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

  const routeImpacts = analyzeRouteImpacts(options.rootDir, changedSourceFiles);
  impactedRoutes.push(...routeImpacts.impactedRoutes);
  findings.push(...routeImpacts.findings);
  recommendedTests.push(...routeImpacts.recommendedTests);

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
