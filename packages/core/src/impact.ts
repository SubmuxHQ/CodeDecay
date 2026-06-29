import { dedupeStrings } from "./collections";
import { compareRiskLevels } from "./risk";
import type { ImpactedArea, ImpactedRoute } from "./types";

export function mergeImpactedRoutes(routes: ImpactedRoute[]): ImpactedRoute[] {
  const merged = new Map<string, ImpactedRoute>();

  for (const route of routes) {
    const key = `${route.framework}:${route.kind}:${route.route}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...route,
        methods: dedupeStrings(route.methods),
        files: dedupeStrings(route.files),
        reasons: dedupeStrings(route.reasons),
        recommendedTests: dedupeStrings(route.recommendedTests)
      });
      continue;
    }

    existing.methods = dedupeStrings([...existing.methods, ...route.methods]);
    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
    existing.recommendedTests = dedupeStrings([...existing.recommendedTests, ...route.recommendedTests]);
    if (compareRiskLevels(route.risk, existing.risk) > 0) {
      existing.risk = route.risk;
    }
  }

  return [...merged.values()].sort((left, right) => {
    const risk = compareRiskLevels(right.risk, left.risk);
    if (risk !== 0) {
      return risk;
    }

    return `${left.framework}:${left.route}`.localeCompare(`${right.framework}:${right.route}`);
  });
}

export function mergeImpactedAreas(areas: ImpactedArea[]): ImpactedArea[] {
  const merged = new Map<string, ImpactedArea>();

  for (const area of areas) {
    const key = `${area.kind}:${area.name}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...area,
        files: dedupeStrings(area.files)
      });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...area.files]);
    if (compareRiskLevels(area.risk, existing.risk) > 0) {
      existing.risk = area.risk;
    }
  }

  return [...merged.values()].sort((left, right) => {
    const risk = compareRiskLevels(right.risk, left.risk);
    if (risk !== 0) {
      return risk;
    }

    return left.name.localeCompare(right.name);
  });
}
