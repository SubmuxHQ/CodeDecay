import type { RiskLevel } from "../risk";
import type { FindingCategory } from "../types";

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
