export const ENGINEERING_POLICY_SCHEMA_VERSION = 1 as const;

export type PolicyChangeClass =
  | "docs"
  | "migration"
  | "source"
  | "protected-path"
  | "test"
  | "config"
  | "unknown";

export type PolicyVerdict =
  | "allow"
  | "require-proof"
  | "require-approval"
  | "denied"
  | "conflict"
  | "exception-invalid"
  | "stale-policy"
  | "needs-human";

export type PolicyScopeKind =
  | "repository"
  | "package"
  | "path"
  | "route"
  | "requirement-class"
  | "data-classification"
  | "environment"
  | "change-class";

export interface PolicyScope {
  kind: PolicyScopeKind;
  match: string;
}

export interface EngineeringPolicy {
  id: string;
  version: number;
  schemaVersion: typeof ENGINEERING_POLICY_SCHEMA_VERSION;
  owner: string;
  rationale: string;
  source: "repository" | "organization";
  precedence: number;
  effectiveAt: string;
  expiresAt?: string | undefined;
  scopes: PolicyScope[];
  requiredEvidence: string[];
  requiredApprovers: string[];
  forbiddenActions: string[];
  protectedPaths: string[];
  allowedTools: string[];
  budgets?: Record<string, number> | undefined;
  exceptionRules?: {
    maxPathBreadth?: number | undefined;
    maxTtlDays?: number | undefined;
  } | undefined;
}

export interface ApprovalRecord {
  id: string;
  policyId: string;
  actor: string;
  reason: string;
  scope: string;
  evidenceIds: string[];
  timestamp: string;
  expiresAt?: string | undefined;
  revoked: boolean;
}

export interface ExceptionRecord {
  id: string;
  policyId: string;
  actor: string;
  reason: string;
  scope: string;
  pathGlobs: string[];
  evidenceIds: string[];
  timestamp: string;
  expiresAt: string;
  revoked: boolean;
}

export interface PolicyDecisionInput {
  changedPaths: string[];
  changeClass: PolicyChangeClass;
  now?: string | undefined;
  codeowners?: Array<{ pattern: string; owners: string[] }> | undefined;
}

export interface ApplicablePolicy {
  policy: EngineeringPolicy;
  matchedScopes: PolicyScope[];
  stale: boolean;
}

export interface PolicyObligation {
  kind: "proof" | "approval" | "forbidden" | "protected-path";
  detail: string;
  policyId: string;
  evidenceId?: string | undefined;
}

export interface PolicyDecisionReport {
  tool: "CodeDecay";
  schemaVersion: typeof ENGINEERING_POLICY_SCHEMA_VERSION;
  generatedAt: string;
  decisionId: string;
  verdict: PolicyVerdict;
  fullyVerified: false;
  changeClass: PolicyChangeClass;
  changedPaths: string[];
  applicable: ApplicablePolicy[];
  obligations: PolicyObligation[];
  approvals: ApprovalRecord[];
  exceptions: ExceptionRecord[];
  conflicts: string[];
  blockers: string[];
  investigationTasks: string[];
  limitations: string[];
  identity: {
    cryptographicProof: false;
    localActorClaimsOnly: true;
    note: string;
  };
  safety: {
    commandsExecuted: false;
    networkCalled: false;
    policyDownloaded: false;
    secretsRead: false;
    agentCanModifyPolicy: false;
  };
}
