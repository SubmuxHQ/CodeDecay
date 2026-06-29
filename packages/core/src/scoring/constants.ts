import type { FindingCategory } from "../types";
import type { RiskLevel } from "../risk";

export const DIRECT_FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 6,
  medium: 16,
  high: 30
};

export const HEURISTIC_FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 4,
  medium: 10,
  high: 18
};

export const DECAY_CATEGORIES = new Set<FindingCategory>(["decay", "scope"]);
export const MERGE_RISK_CATEGORIES = new Set<FindingCategory>(["regression", "coverage", "configuration", "security"]);
export const SECURITY_CATEGORIES = new Set<FindingCategory>(["security"]);

export const DIRECT_FINDING_RULE_IDS = new Set([
  "risky-auth-change",
  "risky-database-change",
  "risky-api-change",
  "risky-config-change",
  "memory-invariant-impacted",
  "memory-past-regression-area",
  "runtime-coverage-miss",
  "runtime-coverage-partial",
  "security-sql-injection",
  "security-hardcoded-secret",
  "security-command-injection",
  "security-path-traversal",
  "security-ssrf",
  "security-unsafe-html",
  "security-insecure-cookie"
]);

export const HEURISTIC_REGRESSION_RULE_IDS = new Set([
  "risky-ui-change",
  "risky-test-change",
  "risky-source-change",
  "risky-docs-change",
  "memory-architecture-note"
]);
