import { compareRiskLevels, type RiskLevel } from "../risk";
import type { Finding } from "../types";
import type { ScoreContributor } from "./types";

export function sortScoreContributors(contributors: ScoreContributor[]): ScoreContributor[] {
  return [...contributors].sort((left, right) => {
    const points = Math.abs(right.points) - Math.abs(left.points);
    if (points !== 0) {
      return points;
    }

    return left.label.localeCompare(right.label);
  });
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function capScoreByHighestSeverity(score: number, findings: Finding[]): number {
  const highestSeverity = highestFindingSeverity(findings);
  if (highestSeverity === "low") {
    return Math.min(score, 39);
  }

  if (highestSeverity === "medium") {
    return Math.min(score, 69);
  }

  return score;
}

export function highestFindingSeverity(findings: Finding[]): RiskLevel | undefined {
  let highest: RiskLevel | undefined;

  for (const finding of findings) {
    if (!highest || compareRiskLevels(finding.severity, highest) > 0) {
      highest = finding.severity;
    }
  }

  return highest;
}
