import {
  AGENT_PROFILE_IDS,
  isAgentProfileId,
  type AgentProfileId,
  type AgentTaskBundleFormat
} from "@submuxhq/codedecay-agent";
import {
  riskLevelFromScore,
  type ProductFailureClassification,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import type { RedteamFormat } from "@submuxhq/codedecay-redteam";
import type { ReportFormat } from "@submuxhq/codedecay-report";
import type { ConfigFormat, PackageManager } from "../types";

const VALID_FORMATS = new Set<ReportFormat>(["json", "markdown", "sarif"]);
const VALID_CONFIG_FORMATS = new Set<ConfigFormat>(["json", "markdown"]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);
const VALID_PRODUCT_FAILURE_CLASSIFICATIONS = new Set<ProductFailureClassification>([
  "confirmed-regression",
  "likely-flaky",
  "environment-failure",
  "auth-or-test-data-failure",
  "generated-test-weakness",
  "unknown"
]);

export const VALID_PACKAGE_MANAGERS = new Set<PackageManager>(["npm", "pnpm", "yarn", "bun"]);

export function parseFormat(value: string): ReportFormat {
  if (VALID_FORMATS.has(value as ReportFormat)) {
    return value as ReportFormat;
  }

  throw new Error(`Invalid format "${value}". Expected json, markdown, or sarif.`);
}

export function parseConfigFormat(value: string): ConfigFormat {
  if (VALID_CONFIG_FORMATS.has(value as ConfigFormat)) {
    return value as ConfigFormat;
  }

  throw new Error(`Invalid config format "${value}". Expected json or markdown.`);
}

export function parseRedteamFormat(value: string): RedteamFormat {
  if (VALID_CONFIG_FORMATS.has(value as RedteamFormat)) {
    return value as RedteamFormat;
  }

  throw new Error(`Invalid redteam format "${value}". Expected json or markdown.`);
}

export function parseAgentFormat(value: string): AgentTaskBundleFormat {
  if (VALID_CONFIG_FORMATS.has(value as AgentTaskBundleFormat)) {
    return value as AgentTaskBundleFormat;
  }

  throw new Error(`Invalid agent format "${value}". Expected json or markdown.`);
}

export function parseAgentProfile(value: string): AgentProfileId {
  if (isAgentProfileId(value)) {
    return value;
  }

  throw new Error(`Invalid agent profile "${value}". Expected ${AGENT_PROFILE_IDS.join(", ")}.`);
}

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

export function parsePackageManager(value: string): PackageManager {
  if (VALID_PACKAGE_MANAGERS.has(value as PackageManager)) {
    return value as PackageManager;
  }

  throw new Error(`Invalid package manager "${value}". Expected npm, pnpm, yarn, or bun.`);
}

export function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new Error(`Invalid value for ${flag}: expected a positive integer.`);
}

export function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}
