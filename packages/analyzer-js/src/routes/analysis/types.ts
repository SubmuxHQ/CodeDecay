import type { Finding, ImpactedRoute } from "@submuxhq/codedecay-core";

export interface RouteImpactAnalysis {
  impactedRoutes: ImpactedRoute[];
  findings: Finding[];
  recommendedTests: string[];
}
