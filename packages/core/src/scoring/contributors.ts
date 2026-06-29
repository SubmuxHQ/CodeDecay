import type { Finding } from "../types";
import type { ScoreContributor, ScoreEvidenceKind } from "./types";
import {
  DIRECT_FINDING_RULE_IDS,
  DIRECT_FINDING_WEIGHTS,
  HEURISTIC_FINDING_WEIGHTS,
  HEURISTIC_REGRESSION_RULE_IDS
} from "./constants";

export function createFindingContributor(finding: Finding): ScoreContributor {
  const evidence = scoreEvidenceForFinding(finding);
  const points = (evidence === "direct" ? DIRECT_FINDING_WEIGHTS : HEURISTIC_FINDING_WEIGHTS)[finding.severity];
  return {
    id: `${finding.ruleId}:${finding.file ?? ""}:${finding.line ?? ""}`,
    label: finding.title,
    points,
    evidence,
    reason: finding.description,
    category: finding.category,
    severity: finding.severity,
    ruleId: finding.ruleId,
    file: finding.file,
    line: finding.line
  };
}

export function runtimePersistenceBoundaryScore(contributors: ScoreContributor[]): number {
  const hasDatabaseChange = contributors.some((contributor) => contributor.ruleId === "risky-database-change");
  const hasConfigChange = contributors.some((contributor) => contributor.ruleId === "risky-config-change");
  const hasHighSeveritySignal = contributors.some((contributor) => contributor.severity === "high");

  return hasDatabaseChange && hasConfigChange && hasHighSeveritySignal ? 8 : 0;
}

function scoreEvidenceForFinding(finding: Finding): ScoreEvidenceKind {
  if ([...DIRECT_FINDING_RULE_IDS].some((ruleId) => finding.ruleId === ruleId || finding.ruleId.startsWith(`${ruleId}-`))) {
    return "direct";
  }

  if (finding.category === "configuration") {
    return "direct";
  }

  if (finding.category === "security") {
    return "heuristic";
  }

  if (finding.category === "regression" && !HEURISTIC_REGRESSION_RULE_IDS.has(finding.ruleId)) {
    return "direct";
  }

  return "heuristic";
}
