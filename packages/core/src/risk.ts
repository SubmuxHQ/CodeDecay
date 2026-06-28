export type RiskLevel = "low" | "medium" | "high";

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  return "low";
}

export function shouldFailForRisk(actual: RiskLevel, threshold: RiskLevel): boolean {
  return RISK_ORDER[actual] >= RISK_ORDER[threshold];
}

export function compareRiskLevels(left: RiskLevel, right: RiskLevel): number {
  return RISK_ORDER[left] - RISK_ORDER[right];
}
