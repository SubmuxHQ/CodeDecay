import {
  riskLevelFromScore,
  type ProductFailureClassification,
  type RiskLevel
} from "@submuxhq/codedecay-core";

const VALID_RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);
const VALID_PRODUCT_FAILURE_CLASSIFICATIONS = new Set<ProductFailureClassification>([
  "confirmed-regression",
  "likely-flaky",
  "environment-failure",
  "auth-or-test-data-failure",
  "generated-test-weakness",
  "unknown"
]);

export function parseRiskLevel(value: string): RiskLevel {
  if (VALID_RISK_LEVELS.has(value as RiskLevel)) {
    return value as RiskLevel;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return riskLevelFromScore(numeric);
  }

  throw new Error(`Invalid risk level "${value}". Expected low, medium, or high.`);
}

export function parseProductFailureClassifications(
  value: string,
  flag: string
): ProductFailureClassification[] {
  const classifications = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (classifications.length === 0) {
    throw new Error(`${flag} requires at least one classification.`);
  }

  const invalid = classifications.find((classification) => !VALID_PRODUCT_FAILURE_CLASSIFICATIONS.has(classification as ProductFailureClassification));
  if (invalid) {
    throw new Error(
      `Invalid product failure classification "${invalid}". Expected ${[...VALID_PRODUCT_FAILURE_CLASSIFICATIONS].join(", ")}.`
    );
  }

  return classifications as ProductFailureClassification[];
}
