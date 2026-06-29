import type { EvidenceSeverity } from "@submuxhq/codedecay-harness";

export interface SemgrepReportAnalysis {
  artifactPath?: string | undefined;
  findings: SemgrepFinding[];
  parseError?: string | undefined;
}

export interface SemgrepFinding {
  checkId?: string | undefined;
  path?: string | undefined;
  line?: number | undefined;
  endLine?: number | undefined;
  message: string;
  severity: EvidenceSeverity;
  rawSeverity?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  fingerprint?: string | undefined;
}
