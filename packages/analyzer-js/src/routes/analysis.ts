import type { FileChange } from "@submuxhq/codedecay-core";
import { buildReverseImportGraph } from "../imports/graph";
import { detectDirectRouteImpacts } from "./analysis/direct";
import { detectPropagatedRouteImpacts } from "./analysis/propagated";
import type { RouteImpactAnalysis } from "./analysis/types";
import { mergeImpactedRoutes } from "./impact";

export type { RouteImpactAnalysis } from "./analysis/types";

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
