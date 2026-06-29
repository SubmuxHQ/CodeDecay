import type { FileChange, Finding, ImpactedRoute } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { firstLine } from "../../findings/builders";
import { dedupeFindings } from "../../findings/sorting";
import { findReverseImportChains } from "../../imports/graph";
import { detectRoutesForFile, mergeImpactedRoutes } from "../impact";
import { normalizePath, readChangedFile } from "./io";
import type { RouteImpactAnalysis } from "./types";

export function detectPropagatedRouteImpacts(
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

      addPropagatedRouteEvidence({
        change,
        chain,
        importerPath,
        routes,
        impactedRoutes,
        findings,
        recommendedTests
      });
    }
  }

  return {
    impactedRoutes: mergeImpactedRoutes(impactedRoutes),
    findings: dedupeFindings(findings),
    recommendedTests: dedupeStrings(recommendedTests)
  };
}

function addPropagatedRouteEvidence(options: {
  change: FileChange;
  chain: string[];
  importerPath: string;
  routes: ImpactedRoute[];
  impactedRoutes: ImpactedRoute[];
  findings: Finding[];
  recommendedTests: string[];
}): void {
  const chainLabel = options.chain.join(" -> ");
  for (const route of options.routes) {
    options.impactedRoutes.push({
      ...route,
      files: dedupeStrings([...route.files, options.change.path]),
      reasons: dedupeStrings([...route.reasons, `Propagated through local imports: ${chainLabel}`])
    });

    options.findings.push({
      ruleId: "propagated-route-impact",
      title: "Changed module flows into a route or API boundary",
      description: `${options.change.path} reaches ${route.route} through local import chain ${chainLabel}. Review the full user-facing or API boundary, not only the changed helper.`,
      severity: route.risk,
      category: "regression",
      file: options.change.path,
      line: firstLine(options.change)
    });

    options.recommendedTests.push(`Add or run tests covering ${options.importerPath} because it depends on ${options.change.path}`);
  }
}
