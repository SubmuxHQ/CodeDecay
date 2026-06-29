import type { FileChange, Finding, RiskLevel } from "@submuxhq/codedecay-core";
import { classifyPath } from "../classifiers/paths";
import { classifyChangedSourceCoverage, buildRuntimeCoverageNotes } from "./classification";
import { loadRuntimeCoverageData } from "./data";
import type { RuntimeCoverageAnalysis } from "./types";

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
