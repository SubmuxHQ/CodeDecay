export type EvidenceSeverity = "info" | "low" | "medium" | "high";

export type EvidenceKind =
  | "diff"
  | "impact"
  | "test"
  | "coverage"
  | "mutation"
  | "static-analysis"
  | "api-fuzz"
  | "contract"
  | "browser-flow"
  | "memory"
  | "agent-suggestion"
  | "execution";

export type EvidenceSourceKind =
  | "codedecay"
  | "harness"
  | "tool"
  | "agent"
  | "memory"
  | "user";

export interface EvidenceSource {
  kind: EvidenceSourceKind;
  name: string;
  id?: string | undefined;
}

export interface Evidence {
  id: string;
  source: EvidenceSource;
  kind: EvidenceKind;
  severity: EvidenceSeverity;
  summary: string;
  trusted: boolean;
  file?: string | undefined;
  line?: number | undefined;
  command?: string | undefined;
  artifactPath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreateEvidenceInput {
  id?: string | undefined;
  source: EvidenceSource;
  kind: EvidenceKind;
  severity?: EvidenceSeverity | undefined;
  summary: string;
  trusted?: boolean | undefined;
  file?: string | undefined;
  line?: number | undefined;
  command?: string | undefined;
  artifactPath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type EvidenceGroupsBySeverity = Record<EvidenceSeverity, Evidence[]>;
