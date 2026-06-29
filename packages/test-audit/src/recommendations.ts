import type { Finding } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import type { StrongerChecksInput } from "./types";

export function recommendStrongerChecks(input: StrongerChecksInput): string[] {
  const checks: string[] = [];

  if (input.status === "missing") {
    for (const file of input.changedSourceFiles.slice(0, 8)) {
      checks.push(`Add or run tests that exercise ${file} through its public behavior path.`);
    }
  }

  for (const finding of [...input.missingTestFindings, ...input.weakTestFindings]) {
    checks.push(strongerCheckForFinding(finding));
  }

  for (const entry of input.runtimeCoverage) {
    if (entry.status === "not_covered") {
      checks.push(`Run or add tests that execute the changed lines in ${entry.path}.`);
    }

    if (entry.status === "partial") {
      const uncovered = entry.uncoveredLines.length > 0 ? ` (${entry.uncoveredLines.join(", ")})` : "";
      checks.push(`Add runtime coverage for uncovered changed lines in ${entry.path}${uncovered}.`);
    }
  }

  checks.push(...input.report.recommendedTests.filter(isTestProofRecommendation).map(normalizeRecommendedCheck));

  if (input.status === "weak" && input.changedTestFiles.length > 0) {
    for (const file of input.changedTestFiles.slice(0, 4)) {
      checks.push(`Strengthen ${file} with assertions, negative cases, and real-boundary coverage.`);
    }
  }

  return dedupeStrings(checks);
}

function strongerCheckForFinding(finding: Finding): string {
  if (finding.ruleId === "test-without-assertions") {
    return `Add meaningful assertions to ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "snapshot-only-test") {
    return `Add explicit behavior assertions alongside snapshots in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "mocked-changed-source") {
    return `Exercise the changed module through a real boundary instead of mocking it in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "copied-implementation-in-test") {
    return `Replace copied implementation assertions with externally visible behavior checks in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "happy-path-only-test") {
    return `Add negative, malformed, missing, or boundary-value cases in ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "heavy-mocking") {
    return `Reduce mock-only confidence by adding a real-module or integration check for ${finding.file ?? "the changed test"}.`;
  }

  if (finding.ruleId === "test-bloat") {
    return `Confirm large test changes in ${finding.file ?? "the changed test"} prove behavior and are not only fixture or mock expansion.`;
  }

  return finding.description;
}

function isTestProofRecommendation(value: string): boolean {
  return /assertion|snapshot|integration|real-module|public API|negative|edge-case|exercise|test|spec|e2e/i.test(value);
}

function normalizeRecommendedCheck(value: string): string {
  const trimmed = value.trim();
  if (isPathLikeRecommendation(trimmed)) {
    return `Run or strengthen ${trimmed} with assertions, negative cases, and real-boundary coverage.`;
  }

  return trimmed;
}

function isPathLikeRecommendation(value: string): boolean {
  const hasNoWhitespace = value.split(/\s+/).length === 1;
  const hasDirectorySeparator = value.includes("/") || value.includes("\\");
  const hasFileExtension = /\.[a-z0-9]+$/i.test(value);
  const hasOnlyPathCharacters = /^[a-z0-9._/-]+$/i.test(value);

  return hasNoWhitespace && hasDirectorySeparator && hasFileExtension && hasOnlyPathCharacters;
}
