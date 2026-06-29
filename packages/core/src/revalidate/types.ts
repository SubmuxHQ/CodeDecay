import type { RiskLevel } from "../risk";
import type { CodeDecayReport } from "../types/report";

export type RevalidationStatus = "fixed" | "false-positive" | "confirmed" | "accepted-risk" | "uncertain";
export type RevalidationItemKind = "finding" | "security-candidate";

export interface RevalidationMarkOptions {
  falsePositiveIds?: string[] | undefined;
  acceptedRiskIds?: string[] | undefined;
}

export interface RevalidationCurrentFile {
  path: string;
  content: string | null;
}

export interface RevalidationInput extends RevalidationMarkOptions {
  previousReport: CodeDecayReport;
  currentReport: CodeDecayReport;
  currentFiles?: RevalidationCurrentFile[] | undefined;
  generatedAt?: string | undefined;
}

export interface RevalidationItem {
  id: string;
  kind: RevalidationItemKind;
  status: RevalidationStatus;
  ruleId: string;
  title: string;
  description: string;
  severity: RiskLevel;
  file?: string | undefined;
  line?: number | undefined;
  evidence: string[];
}

export interface RevalidationMemorySuggestion {
  section: "regressions";
  sourceItemId: string;
  title: string;
  description: string;
  severity: RiskLevel;
  files: string[];
}

export interface RevalidationReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  previous: {
    generatedAt: string;
    base?: string | undefined;
    head?: string | undefined;
  };
  current: {
    generatedAt: string;
    base?: string | undefined;
    head?: string | undefined;
  };
  summary: Record<RevalidationStatus, number> & {
    total: number;
    memorySuggestions: number;
  };
  items: RevalidationItem[];
  memorySuggestions: RevalidationMemorySuggestion[];
  safety: {
    deterministic: true;
    llmCalled: false;
    telemetrySent: false;
    cloudDependency: false;
    notes: string[];
  };
}
