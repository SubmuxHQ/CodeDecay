import type { ImpactedRoute } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { higherRisk } from "./shared";

export function mergeImpactedRoutes(routes: ImpactedRoute[]): ImpactedRoute[] {
  const byKey = new Map<string, ImpactedRoute>();

  for (const route of routes) {
    const key = `${route.framework}:${route.kind}:${route.route}:${route.methods.join(",")}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        ...route,
        files: [...route.files],
        reasons: [...route.reasons],
        recommendedTests: [...route.recommendedTests]
      });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
    existing.risk = higherRisk(existing.risk, route.risk);
    existing.recommendedTests = dedupeStrings([...existing.recommendedTests, ...route.recommendedTests]);
  }

  return [...byKey.values()];
}
