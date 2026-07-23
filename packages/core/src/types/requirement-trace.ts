import type { RequirementFlowKind } from "../requirements";

export type RequirementTraceStatus =
  | "unmapped"
  | "implementation-found"
  | "proof-missing"
  | "proof-failed"
  | "verified"
  | "needs-human";

export type RequirementTraceEvidenceKind =
  | "implementation-file"
  | "implementation-symbol"
  | "implementation-route"
  | "affected-flow"
  | "test-proof"
  | "configured-check"
  | "differential"
  | "product-failure"
  | "coverage"
  | "mutation"
  | "security"
  | "agent-suggestion"
  | "agent-edit"
  | "fix-task"
  | "limitation";

export type RequirementTraceEvidenceOutcome =
  | "mapping"
  | "passed"
  | "failed"
  | "missing"
  | "untrusted"
  | "informational";

export interface RequirementTraceEvidence {
  id: string;
  kind: RequirementTraceEvidenceKind;
  outcome: RequirementTraceEvidenceOutcome;
  trusted: boolean;
  source: string;
  target: string;
  summary: string;
  file?: string | undefined;
  symbol?: string | undefined;
  route?: string | undefined;
  command?: string | undefined;
}

export interface RequirementTraceImplementation {
  files: string[];
  symbols: string[];
  routes: string[];
  flows: Array<{ name: string; kind: RequirementFlowKind }>;
}

export interface RequirementCriterionTrace {
  requirementId: string;
  text: string;
  sourceIds: string[];
  requiredProof: string[];
  status: RequirementTraceStatus;
  implementation: RequirementTraceImplementation;
  risks: string[];
  edgeCases: string[];
  evidence: RequirementTraceEvidence[];
  limitations: string[];
}

export interface RequirementTraceSummary {
  total: number;
  statuses: Record<RequirementTraceStatus, number>;
  blockingRequirementIds: string[];
}

export interface RequirementTraceGraph {
  schemaVersion: 1;
  criteria: RequirementCriterionTrace[];
  summary: RequirementTraceSummary;
}

export type RequirementTraceExternalStatus = "passed" | "failed" | "missing" | "untrusted" | "informational";

export interface RequirementTraceExternalEvidence {
  id: string;
  kind: Exclude<
    RequirementTraceEvidenceKind,
    "implementation-file" | "implementation-symbol" | "implementation-route" | "affected-flow" | "limitation"
  >;
  name: string;
  status: RequirementTraceExternalStatus;
  trusted: boolean;
  summary: string;
  files?: string[] | undefined;
  command?: string | undefined;
}

export interface RequirementTraceAgentSuggestionInput {
  title: string;
  detail: string;
  affectedFlows?: string[] | undefined;
  evidence?: string[] | undefined;
}
