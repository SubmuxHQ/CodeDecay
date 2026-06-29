import { compareRiskLevels, type RiskLevel } from "./risk";
import type { Finding } from "./types";

export function findingCounts(findings: Finding[]): Record<RiskLevel, number> {
  return findings.reduce<Record<RiskLevel, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { low: 0, medium: 0, high: 0 }
  );
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const severity = compareRiskLevels(right.severity, left.severity);
    if (severity !== 0) {
      return severity;
    }

    return left.ruleId.localeCompare(right.ruleId);
  });
}
