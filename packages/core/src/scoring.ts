import type { FileChange, Finding, FindingCategory } from "./index";
import { compareRiskLevels, type RiskLevel } from "./risk";

export type ScoreEvidenceKind = "direct" | "heuristic" | "structural";

export interface ScoreContributor {
  id: string;
  label: string;
  points: number;
  evidence: ScoreEvidenceKind;
  reason: string;
  category?: FindingCategory | undefined;
  severity?: RiskLevel | undefined;
  ruleId?: string | undefined;
  file?: string | undefined;
  line?: number | undefined;
}

export interface ScoreBreakdown {
  score: number;
  rawScore: number;
  adjustedScore: number;
  highestSeverity?: RiskLevel | undefined;
  heuristicOnly: boolean;
  contributors: ScoreContributor[];
  dampeners: ScoreContributor[];
  notes: string[];
}

const DIRECT_FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 6,
  medium: 16,
  high: 30
};

const HEURISTIC_FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 4,
  medium: 10,
  high: 18
};

const DECAY_CATEGORIES = new Set<FindingCategory>(["decay", "scope"]);
const MERGE_RISK_CATEGORIES = new Set<FindingCategory>(["regression", "coverage", "configuration"]);

const DIRECT_FINDING_RULE_IDS = new Set([
  "risky-auth-change",
  "risky-database-change",
  "risky-api-change",
  "risky-config-change",
  "memory-invariant-impacted",
  "memory-past-regression-area",
  "runtime-coverage-miss",
  "runtime-coverage-partial"
]);

const HEURISTIC_REGRESSION_RULE_IDS = new Set([
  "risky-ui-change",
  "risky-test-change",
  "risky-source-change",
  "risky-docs-change",
  "memory-architecture-note"
]);

export function calculateMergeRiskBreakdown(findings: Finding[], changedFiles: FileChange[]): ScoreBreakdown {
  return calculateScoreBreakdown(findings, MERGE_RISK_CATEGORIES, changedFiles, "merge");
}

export function calculateDecayBreakdown(findings: Finding[], changedFiles: FileChange[]): ScoreBreakdown {
  return calculateScoreBreakdown(findings, DECAY_CATEGORIES, changedFiles, "decay");
}

function calculateScoreBreakdown(
  findings: Finding[],
  includedCategories: Set<FindingCategory>,
  changedFiles: FileChange[],
  scoreKind: "merge" | "decay"
): ScoreBreakdown {
  const relevantFindings = findings.filter((finding) => includedCategories.has(finding.category));
  const contributors = relevantFindings.map((finding) => createFindingContributor(finding));
  const directContributors = contributors.filter((contributor) => contributor.evidence === "direct");
  const heuristicOnly = relevantFindings.length > 0 && directContributors.length === 0;
  const structuralMultiplier = directContributors.length > 0 ? 1 : relevantFindings.length > 0 ? 0.5 : 0;
  const changeSizeScore = Math.round(
    Math.min(
      18,
      Math.floor(changedFiles.reduce((sum, file) => sum + file.additions + file.deletions, 0) / 120) * 3
    ) * structuralMultiplier
  );
  const fileSpreadScore = Math.round(Math.min(12, Math.max(0, changedFiles.length - 5) * 2) * structuralMultiplier);

  if (changeSizeScore > 0) {
    contributors.push({
      id: "change-size",
      label: "Change size",
      points: changeSizeScore,
      evidence: "structural",
      reason: `Changed lines amplify review cost across ${changedFiles.length} file(s).`
    });
  }

  if (fileSpreadScore > 0) {
    contributors.push({
      id: "file-spread",
      label: "File spread",
      points: fileSpreadScore,
      evidence: "structural",
      reason: `Change breadth spans ${changedFiles.length} file(s).`
    });
  }

  const runtimePersistenceScore = scoreKind === "merge" ? runtimePersistenceBoundaryScore(contributors) : 0;
  if (runtimePersistenceScore > 0) {
    contributors.push({
      id: "runtime-persistence-boundary",
      label: "Runtime config plus persistence boundary",
      points: runtimePersistenceScore,
      evidence: "structural",
      reason: "Runtime configuration and database/schema behavior changed together, which increases production regression risk."
    });
  }

  const rawScore = clampScore(contributors.reduce((score, contributor) => score + contributor.points, 0));
  const dampeners: ScoreContributor[] = [];
  let adjustedScore = rawScore;

  if (heuristicOnly) {
    const scoreLabel = scoreKind === "merge" ? "Merge risk" : "Decay";
    const dampenerPoints = Math.min(16, Math.max(4, Math.round(rawScore * 0.25)));
    dampeners.push({
      id: "heuristic-only-dampener",
      label: "Heuristic-only dampener",
      points: -dampenerPoints,
      evidence: "heuristic",
      reason: `${scoreLabel} stays conservative until direct evidence exists.`
    });
    adjustedScore = clampScore(adjustedScore - dampenerPoints);
  }

  let score = capScoreByHighestSeverity(adjustedScore, relevantFindings);
  const notes: string[] = [];
  if (heuristicOnly) {
    const scoreLabel = scoreKind === "merge" ? "merge risk" : "decay";
    score = Math.min(score, 54);
    notes.push(`Heuristic-only ${scoreLabel} is capped at 54/100 until direct evidence exists.`);
  }

  if (changeSizeScore === 0 && fileSpreadScore === 0 && relevantFindings.length > 0) {
    notes.push("Blast-radius multipliers were suppressed because the current finding set is narrow or low-signal.");
  }

  return {
    score,
    rawScore,
    adjustedScore,
    highestSeverity: highestFindingSeverity(relevantFindings),
    heuristicOnly,
    contributors: sortScoreContributors(contributors),
    dampeners: sortScoreContributors(dampeners),
    notes
  };
}

function createFindingContributor(finding: Finding): ScoreContributor {
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

function runtimePersistenceBoundaryScore(contributors: ScoreContributor[]): number {
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

  if (finding.category === "regression" && !HEURISTIC_REGRESSION_RULE_IDS.has(finding.ruleId)) {
    return "direct";
  }

  return "heuristic";
}

function sortScoreContributors(contributors: ScoreContributor[]): ScoreContributor[] {
  return [...contributors].sort((left, right) => {
    const points = Math.abs(right.points) - Math.abs(left.points);
    if (points !== 0) {
      return points;
    }

    return left.label.localeCompare(right.label);
  });
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function capScoreByHighestSeverity(score: number, findings: Finding[]): number {
  const highestSeverity = highestFindingSeverity(findings);
  if (highestSeverity === "low") {
    return Math.min(score, 39);
  }

  if (highestSeverity === "medium") {
    return Math.min(score, 69);
  }

  return score;
}

function highestFindingSeverity(findings: Finding[]): RiskLevel | undefined {
  let highest: RiskLevel | undefined;

  for (const finding of findings) {
    if (!highest || compareRiskLevels(finding.severity, highest) > 0) {
      highest = finding.severity;
    }
  }

  return highest;
}
