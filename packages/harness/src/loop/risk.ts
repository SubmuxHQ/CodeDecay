import type { RiskLevel } from "@submuxhq/codedecay-core";

export function riskRank(level: RiskLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}
