import type { CodeDecayReport } from "@submuxhq/codedecay-core";

export function suggestEdgeCases(report: CodeDecayReport): string[] {
  const suggestions = new Set<string>();

  for (const area of report.impactedAreas) {
    if (area.kind === "api") {
      suggestions.add("Exercise the real API route with malformed, missing, and boundary-value payloads.");
      suggestions.add("Check auth, validation, and downstream consumers through the route, not only helper functions.");
    }

    if (area.kind === "auth") {
      suggestions.add("Check missing, expired, malformed, and privilege-escalation credentials.");
      suggestions.add("Verify denied paths fail closed and do not silently return privileged defaults.");
    }

    if (area.kind === "database") {
      suggestions.add("Check migration/schema compatibility with existing records and null/default values.");
      suggestions.add("Verify read and write paths that depend on changed schema fields.");
    }

    if (area.kind === "ui") {
      suggestions.add("Check loading, empty, error, and permission-denied UI states.");
      suggestions.add("Exercise the real route through browser or component integration tests.");
    }

    if (area.kind === "config") {
      suggestions.add("Run build/start commands in a clean environment to catch config or packaging regressions.");
      suggestions.add("Verify CI and production-like environment variables still resolve correctly.");
    }
  }

  for (const recommendation of report.recommendedTests) {
    suggestions.add(recommendation);
  }

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}
