import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnalyzerResult,
  DesignContract,
  FileChange,
  Finding,
  ImpactedRoute,
  ImpactedArea
} from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { scanSecurityCandidates } from "@submuxhq/codedecay-matchers";
import { analyzeImpactedAreas } from "./areas/analysis";
import { isSourcePath, isTestPath } from "./classifiers/paths";
import { detectFunctionMetricFindings } from "./decay/function-findings";
import { detectFragilePatterns } from "./decay/fragile-patterns";
import { detectDuplicateAddedLogic } from "./duplicates/added-logic";
import { dedupeFindings } from "./findings/sorting";
import { analyzeLanguageSupport } from "./language/support";
import { analyzeRouteImpacts } from "./routes/analysis";
import { mergeImpactedRoutes } from "./routes/impact";
import { analyzeRuntimeCoverage } from "./runtime-coverage";
import { detectBroadUnrelatedChanges } from "./scope/broad-change";
import { analyzeSymbolImpacts } from "./symbols/graph";
import { checkDesignContract } from "./contract";
import { detectTestBloat } from "./tests/bloat";
import { createChangedPathTestProofMap } from "./test-proof/proof-map";
import { analyzeTestRecommendations } from "./tests/recommendations";
import { detectWeakTests } from "./tests/weak-audit";

export { listRepoFiles } from "./files/repo";
export { ANALYZER_CACHE_PATH, getAnalyzerCacheSummary } from "./cache/artifacts";
export type { AnalyzerCacheRunStats, AnalyzerCacheSummary } from "./cache/artifacts";

export interface AnalyzeJsOptions {
  rootDir: string;
  changedFiles: FileChange[];
  designContract?: DesignContract | undefined;
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
  const languageAnalysis = analyzeLanguageSupport(options.changedFiles);
  const parserSupportedSourcePaths = new Set(languageAnalysis.supportedFiles);
  const parserSupportedSourceFiles = changedSourceFiles.filter((change) => parserSupportedSourcePaths.has(change.path));
  const runtimeCoverage = analyzeRuntimeCoverage(options.rootDir, changedSourceFiles);
  const securityScan = scanSecurityCandidates({
    files: parserSupportedSourceFiles.map((change) => ({
      path: change.path,
      content: readChangeContent(options.rootDir, change)
    }))
  });
  const fullyCoveredSourcePaths = new Set(
    runtimeCoverage.testEvidence.changedSources.filter((entry) => entry.status === "covered").map((entry) => entry.path)
  );

  const areaAnalysis = analyzeImpactedAreas(options.changedFiles);
  impactedAreas.push(...areaAnalysis.impactedAreas);
  findings.push(...areaAnalysis.findings);

  const symbolImpactAnalysis = analyzeSymbolImpacts(options.rootDir, changedSourceFiles);
  recommendedTests.push(...symbolImpactAnalysis.recommendedTests);
  impactedRoutes.push(...symbolImpactAnalysis.impactedRoutes);

  const routeImpacts = analyzeRouteImpacts(options.rootDir, parserSupportedSourceFiles);
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

  findings.push(
    ...checkDesignContract({
      rootDir: options.rootDir,
      changedFiles: options.changedFiles,
      impactedAreas,
      contract: options.designContract
    }).findings
  );

  findings.push(...detectFragilePatterns(options.changedFiles));
  findings.push(...detectTestBloat(options.changedFiles, changedSourceFiles));
  findings.push(...detectDuplicateAddedLogic(options.changedFiles));
  findings.push(...runtimeCoverage.findings);
  findings.push(...securityScan.findings);
  recommendedTests.push(...runtimeCoverage.recommendedTests);

  const testAudit = detectWeakTests(options.rootDir, changedTestFiles, changedSourceFiles);
  findings.push(...testAudit.findings);
  recommendedTests.push(...testAudit.recommendedTests);
  findings.push(...detectFunctionMetricFindings(options.rootDir, parserSupportedSourceFiles));

  const testProofMap = createChangedPathTestProofMap({
    rootDir: options.rootDir,
    changedSourceFiles: parserSupportedSourceFiles,
    changedTestFiles,
    testEvidence: runtimeCoverage.testEvidence,
    symbolImpacts: symbolImpactAnalysis.impacts
  });
  recommendedTests.push(
    ...testProofMap.entries
      .filter((entry) => entry.status !== "proven_by_runtime_coverage")
      .map((entry) => entry.repairTask)
  );

  const result: AnalyzerResult = {
    findings: dedupeFindings(findings),
    impactedAreas,
    impactedRoutes: mergeImpactedRoutes(impactedRoutes),
    impactGraph: symbolImpactAnalysis.impactGraphSummary,
    symbolImpactGraph: symbolImpactAnalysis.graphSummary,
    symbolImpacts: symbolImpactAnalysis.impacts,
    languageAnalysis,
    securityAnalysis: {
      scannedFiles: securityScan.scannedFiles,
      candidateCount: securityScan.candidates.length,
      skippedFiles: securityScan.skippedFiles
    },
    recommendedTests: recommendedTests.length > 0 ? dedupeStrings(recommendedTests) : ["Run the test suite for changed packages or apps."],
    testEvidence: runtimeCoverage.testEvidence,
    testProofMap
  };

  if (securityScan.candidates.length > 0) {
    result.securityCandidates = securityScan.candidates;
  }

  return result;
}

function readChangeContent(rootDir: string, change: FileChange): string {
  try {
    return readFileSync(join(rootDir, change.path), "utf8");
  } catch {
    return change.addedLines.map((line) => line.content).join("\n");
  }
}
