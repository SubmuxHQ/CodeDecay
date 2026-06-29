import type { FileChange, Finding, FindingCategory } from "./types";
import { DECAY_CATEGORIES, MERGE_RISK_CATEGORIES } from "./scoring/constants";
import { createFindingContributor, runtimePersistenceBoundaryScore } from "./scoring/contributors";
import {
  capScoreByHighestSeverity,
  clampScore,
  highestFindingSeverity,
  sortScoreContributors
} from "./scoring/score-math";
import type { ScoreBreakdown, ScoreContributor } from "./scoring/types";

export type { ScoreBreakdown, ScoreContributor, ScoreEvidenceKind } from "./scoring/types";

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
