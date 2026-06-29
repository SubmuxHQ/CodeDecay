import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileChange, Finding, ImpactedRoute } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { firstLine } from "../findings/builders";
import { dedupeFindings } from "../findings/sorting";
import { buildReverseImportGraph, findReverseImportChains } from "../imports/graph";
import { detectRoutesForFile, mergeImpactedRoutes } from "./impact";

export interface RouteImpactAnalysis {
  impactedRoutes: ImpactedRoute[];
  findings: Finding[];
  recommendedTests: string[];
}

export function analyzeRouteImpacts(rootDir: string, changedSourceFiles: FileChange[]): RouteImpactAnalysis {
  const reverseImportGraph = buildReverseImportGraph(rootDir);
  const directRouteImpacts = detectDirectRouteImpacts(rootDir, changedSourceFiles);
  const propagatedRouteImpacts = detectPropagatedRouteImpacts(rootDir, changedSourceFiles, reverseImportGraph);

  return {
    impactedRoutes: mergeImpactedRoutes([...directRouteImpacts, ...propagatedRouteImpacts.impactedRoutes]),
    findings: propagatedRouteImpacts.findings,
    recommendedTests: propagatedRouteImpacts.recommendedTests
  };
}

function detectDirectRouteImpacts(rootDir: string, changedSourceFiles: FileChange[]): ImpactedRoute[] {
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
): RouteImpactAnalysis {
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
