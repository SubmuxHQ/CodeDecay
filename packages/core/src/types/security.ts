import type { RiskLevel } from "../risk";

export type SecurityCandidateConfidence = "direct" | "heuristic" | "entry-point" | "indirect";

export interface SecurityCandidate {
  ruleId: string;
  cwe?: string | undefined;
  title: string;
  description: string;
  severity: RiskLevel;
  confidence: SecurityCandidateConfidence;
  file: string;
  line?: number | undefined;
  snippet?: string | undefined;
  evidence: string;
}

export interface SecuritySkippedFile {
  path: string;
  reason: string;
}

export interface SecurityAnalysisSummary {
  scannedFiles: string[];
  candidateCount: number;
  skippedFiles: SecuritySkippedFile[];
}
