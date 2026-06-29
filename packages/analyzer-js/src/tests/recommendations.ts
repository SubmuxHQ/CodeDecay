import { basename, dirname } from "node:path";
import type { FileChange, Finding } from "@submuxhq/codedecay-core";
import { classifyChange, isTestPath } from "../classifiers/paths";
import { listRepoFiles } from "../files/repo";
import { createMissingNearbyTestsFinding } from "../findings/builders";

export interface TestRecommendationAnalysis {
  findings: Finding[];
  recommendedTests: string[];
}

export interface AnalyzeTestRecommendationsOptions {
  rootDir: string;
  changedSourceFiles: FileChange[];
  changedTestFiles: FileChange[];
  fullyCoveredSourcePaths?: Set<string>;
}

export function analyzeTestRecommendations(options: AnalyzeTestRecommendationsOptions): TestRecommendationAnalysis {
  const findings: Finding[] = [];

  if (options.changedSourceFiles.length > 0 && options.changedTestFiles.length === 0) {
    const riskySourceFiles = options.changedSourceFiles
      .filter((change) => classifyChange(change)?.risk !== "low")
      .filter((change) => !options.fullyCoveredSourcePaths?.has(change.path));

    if (riskySourceFiles.length > 0) {
      findings.push(
        createMissingNearbyTestsFinding(
          riskySourceFiles,
          riskySourceFiles.some((change) => classifyChange(change)?.risk === "high") ? "high" : "medium"
        )
      );
    }
  }

  return {
    findings,
    recommendedTests: recommendTests(options.rootDir, options.changedSourceFiles)
  };
}

export function recommendTests(rootDir: string, sourceChanges: FileChange[]): string[] {
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

function stripExtension(path: string): string {
  return path.replace(/\.[^.]+$/, "");
}
