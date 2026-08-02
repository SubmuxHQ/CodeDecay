import type {
  AnalyzerResult,
  FileChange,
  ImpactedArea,
  RiskLevel
} from "@submuxhq/codedecay-core";

export interface CodeDecayMemory {
  version: 1;
  flows: MemoryFlow[];
  commands: MemoryCommand[];
  invariants: MemoryInvariant[];
  architecture: MemoryArchitectureNote[];
  regressions: MemoryRegression[];
  learningEvents?: MemoryLearningEvent[] | undefined;
}

export interface MemoryMatcher {
  files?: string[] | undefined;
  areas?: ImpactedArea["kind"][] | undefined;
  productPaths?: string[] | undefined;
}

export interface MemoryFlow extends MemoryMatcher {
  name: string;
  description?: string | undefined;
  checks?: string[] | undefined;
}

export interface MemoryCommand extends MemoryMatcher {
  name: string;
  command: string;
  description?: string | undefined;
}

export interface MemoryInvariant extends MemoryMatcher {
  name: string;
  description: string;
  severity?: RiskLevel | undefined;
}

export interface MemoryArchitectureNote extends MemoryMatcher {
  title: string;
  note: string;
}

export interface MemoryRegression extends MemoryMatcher {
  title: string;
  description: string;
  check?: string | undefined;
  severity?: RiskLevel | undefined;
}

export type MemoryLearningEventKind =
  | "confirmed-regression"
  | "verified-repair"
  | "refuted-hypothesis"
  | "accepted-risk"
  | "incident"
  | "architecture-decision"
  | "convention"
  | "ownership-change"
  | "proof-recipe";

export type MemoryLearningTrustClass =
  | "tool-evidence"
  | "runtime-evidence"
  | "human-approved"
  | "agent-proposal-untrusted"
  | "pr-text-untrusted"
  | "external-memory-untrusted";

export type MemoryLearningReviewStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "superseded"
  | "expired"
  | "revoked";

export interface MemoryLearningScope extends MemoryMatcher {
  repository?: string | undefined;
  revision?: string | undefined;
  symbols?: string[] | undefined;
}

export interface MemoryLearningAuditEntry {
  action: "propose" | "approve" | "reject" | "supersede" | "expire" | "revoke";
  actor: string;
  timestamp: string;
  reason: string;
  evidenceIds?: string[] | undefined;
}

export interface MemoryLearningEvent {
  id: string;
  schemaVersion: 1;
  kind: MemoryLearningEventKind;
  title: string;
  summary: string;
  invariant?: string | undefined;
  proofRecipe?: string | undefined;
  sourceEvidenceIds: string[];
  scope: MemoryLearningScope;
  confidence: number;
  trustClass: MemoryLearningTrustClass;
  creator: string;
  createdAt: string;
  reviewStatus: MemoryLearningReviewStatus;
  reviewDueAt?: string | undefined;
  supersedes?: string[] | undefined;
  expiresAt?: string | undefined;
  auditTrail: MemoryLearningAuditEntry[];
}

export interface MemoryLearningEventInput {
  kind: MemoryLearningEventKind;
  title: string;
  summary: string;
  invariant?: string | undefined;
  proofRecipe?: string | undefined;
  sourceEvidenceIds: string[];
  scope?: MemoryLearningScope | undefined;
  confidence?: number | undefined;
  trustClass: MemoryLearningTrustClass;
  creator: string;
  timestamp: string;
  reviewDueAt?: string | undefined;
  supersedes?: string[] | undefined;
  expiresAt?: string | undefined;
}

export interface MemoryLearningOperationInput {
  eventId: string;
  action: "approve" | "reject" | "supersede" | "expire" | "revoke";
  actor: string;
  timestamp: string;
  reason: string;
  evidenceIds?: string[] | undefined;
}

export interface MemoryLearningRetrievalInput {
  memory: CodeDecayMemory;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  repository?: string | undefined;
  revision?: string | undefined;
  now?: string | undefined;
}

export interface MemoryLearningRetrievalEntry {
  event: MemoryLearningEvent;
  reason: string;
}

export interface MemoryLearningRetrievalResult {
  included: MemoryLearningRetrievalEntry[];
  suppressed: MemoryLearningRetrievalEntry[];
}

export interface LoadedCodeDecayMemory {
  memory: CodeDecayMemory;
  sourcePath?: string | undefined;
}

export interface MemoryImportCounts {
  flows: number;
  commands: number;
  invariants: number;
  architecture: number;
  regressions: number;
}

export interface MemoryImportResult {
  memory: CodeDecayMemory;
  added: MemoryImportCounts;
  merged: MemoryImportCounts;
}

export interface MemoryLearnResult extends MemoryImportResult {
  learned: MemoryImportCounts;
  proposals: MemoryLearningProposal[];
}

export type MemoryLearningProposalSection = keyof MemoryImportCounts;
export type MemoryLearningProposalConfidence = RiskLevel;
export type MemoryLearningSourceType =
  | "ci-failure"
  | "pull-request"
  | "codedecay-report"
  | "product-report"
  | "incident"
  | "incident-markdown";

export interface MemoryLearningProposalSource {
  type: MemoryLearningSourceType;
  path: string;
  title?: string | undefined;
  url?: string | undefined;
  id?: string | undefined;
  labels?: string[] | undefined;
}

export interface MemoryLearningProposal {
  id: string;
  section: MemoryLearningProposalSection;
  title: string;
  source: MemoryLearningProposalSource;
  confidence: MemoryLearningProposalConfidence;
  timestamp: string;
  why: string;
  entry:
    | MemoryFlow
    | MemoryCommand
    | MemoryInvariant
    | MemoryArchitectureNote
    | MemoryRegression;
}

export type MemoryProviderKind = "local" | "external";

export interface MemoryProviderLoadOptions {
  rootDir: string;
}

export type MemoryProviderLoadResult = LoadedCodeDecayMemory | Promise<LoadedCodeDecayMemory>;

export interface MemoryProvider {
  id: string;
  name: string;
  kind: MemoryProviderKind;
  load(options: MemoryProviderLoadOptions): MemoryProviderLoadResult;
}

export interface MemoryContextInput {
  memory: CodeDecayMemory;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  analyzerResult: AnalyzerResult;
}

export const DEFAULT_CODEDECAY_MEMORY: CodeDecayMemory = {
  version: 1,
  flows: [],
  commands: [],
  invariants: [],
  architecture: [],
  regressions: [],
  learningEvents: []
};
