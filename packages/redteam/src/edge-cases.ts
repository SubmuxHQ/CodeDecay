import type { CodeDecayReport, ImpactedArea } from "@submuxhq/codedecay-core";

const EDGE_CASES_BY_AREA: Partial<Record<ImpactedArea["kind"], string[]>> = {
  api: [
    "Exercise the real API route with malformed, missing, and boundary-value payloads.",
    "Verify auth, validation, and downstream consumers through the route, not only helper functions."
  ],
  auth: [
    "Check missing, expired, malformed, and privilege-escalation credentials.",
    "Verify denied paths fail closed and do not silently return privileged defaults."
  ],
  database: [
    "Check migration/schema compatibility with existing records and null/default values.",
    "Verify read and write paths that depend on changed schema fields."
  ],
  ui: [
    "Check loading, empty, error, and permission-denied UI states.",
    "Exercise the real route through browser or component integration tests."
  ],
  config: [
    "Run build/start commands in a clean environment to catch config or packaging regressions.",
    "Verify CI and production-like environment variables still resolve correctly."
  ],
  test: ["Check whether changed tests exercise real production boundaries or only mocked helper logic."]
};

export function suggestEdgeCases(report: CodeDecayReport): string[] {
  const suggestions = new Set<string>();

  for (const area of report.impactedAreas) {
    for (const suggestion of EDGE_CASES_BY_AREA[area.kind] ?? []) {
      suggestions.add(suggestion);
    }
  }

  for (const recommendation of report.recommendedTests) {
    suggestions.add(normalizeEdgeCaseRecommendation(recommendation));
  }

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}

function normalizeEdgeCaseRecommendation(recommendation: string): string {
  const trimmed = recommendation.trim();
  if (isPathLikeRecommendation(trimmed)) {
    return `Run or strengthen ${trimmed} with negative, malformed, boundary, or integration coverage.`;
  }

  return trimmed;
}

function isPathLikeRecommendation(value: string): boolean {
  return /^[a-z0-9._/-]+\.[a-z0-9]+$/i.test(value) && !/\s/.test(value) && /[/\\]/.test(value);
}
