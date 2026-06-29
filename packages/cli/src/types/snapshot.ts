import type { RiskLevel, TestEvidenceMode } from "@submuxhq/codedecay-core";
import type { ConfigFormat } from "./common";

export interface SnapshotOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  compare?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
}

export interface TrendSnapshot {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  base?: string | undefined;
  head?: string | undefined;
  summary: {
    mergeRiskScore: number;
    decayScore: number;
    riskLevel: RiskLevel;
    changedFiles: number;
    impactedAreas: number;
    impactedRoutes: number;
    findingCounts: Record<RiskLevel, number>;
    missingTestFindings: number;
    weakTestFindings: number;
    evidenceMode: TestEvidenceMode;
    highRiskFiles: string[];
    impactedAreaKinds: string[];
  };
}

export interface TrendSnapshotComparison {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  current: TrendSnapshot;
  previous: TrendSnapshot;
  delta: {
    mergeRiskScore: number;
    decayScore: number;
    changedFiles: number;
    impactedAreas: number;
    impactedRoutes: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    missingTestFindings: number;
    weakTestFindings: number;
  };
}
