import type { CommandExecutionResult, SafeCommandPolicy } from "@submuxhq/codedecay-execution";
import type { FileChange, RequirementTraceGraph, RequirementTraceStatus, RiskLevel } from "@submuxhq/codedecay-core";

export type LoopStatus =
  | "verified"
  | "shallow-proof"
  | "merge-safe-verified"
  | "merge-safe-shallow"
  | "unverified"
  | "stuck"
  | "budget-exhausted"
  | "unsafe-change"
  | "needs-human"
  | "plan-only"
  | "builder-error"
  | "verifier-error"
  | "agent-error";

export type LoopAgentRole = "builder" | "verifier";

export type LoopStateMachinePhase =
  | "plan"
  | "build-edit"
  | "analyze"
  | "challenge"
  | "verify"
  | "repair"
  | "current-tree-reverify"
  | "terminal-verdict";

export type LoopFormat = "json" | "markdown";

export type LoopCheckStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timed_out"
  | "error"
  | "blocked"
  | "not-configured";

export interface LoopRedteamReport {
  version: string;
  summary: {
    riskLevel: RiskLevel;
    mergeRiskScore: number;
    decayScore: number;
    securityScore: number;
    weakTestFindings: number;
    productFailureBundles: number;
    fixTasks: number;
  };
  analysis: {
    findings: Array<{
      ruleId: string;
      title: string;
      severity: RiskLevel;
      category: string;
      file?: string | undefined;
      line?: number | undefined;
    }>;
    securityAnalysis?: {
      scannedFiles: string[];
      candidateCount: number;
    } | undefined;
    securityCandidates?: Array<{
      ruleId: string;
      title: string;
      severity: RiskLevel;
      confidence: string;
      file: string;
      line?: number | undefined;
    }> | undefined;
  };
  fixTasks: LoopFixTask[];
  requirementTrace?: RequirementTraceGraph | undefined;
  safety: {
    commandsExecuted: boolean;
    llmCalled: boolean;
    telemetrySent: false;
    cloudDependency: false;
  };
}

export interface LoopFixTask {
  title: string;
  priority: RiskLevel;
  source: string;
  detail: string;
  file?: string | undefined;
  line?: number | undefined;
}

export interface LoopCheckSnapshot {
  configured: boolean;
  status: LoopCheckStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  errors: number;
  durationMs: number;
  semgrep: LoopSecurityToolSnapshot;
  coverage: LoopCoverageSnapshot;
  mutation: LoopMutationSnapshot;
  note?: string | undefined;
}

export interface LoopSecurityToolSnapshot {
  configured: boolean;
  ran: boolean;
  status: LoopCheckStatus;
  findingCount: number;
  highFindingCount: number;
  maxSeverity?: RiskLevel | undefined;
}

export interface LoopCoverageSnapshot {
  configured: boolean;
  present: boolean;
  status: LoopCheckStatus;
  percent?: number | undefined;
  measuredLines?: number | undefined;
  coveredLines?: number | undefined;
  uncoveredLines?: number | undefined;
}

export interface LoopMutationSnapshot {
  configured: boolean;
  present: boolean;
  status: LoopCheckStatus;
  mutationScore?: number | undefined;
  totalMutants?: number | undefined;
  weakMutants?: number | undefined;
}

export interface LoopAgentResult {
  role?: LoopAgentRole | undefined;
  identity?: string | undefined;
  command: string;
  status: CommandExecutionResult["status"];
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  madeChanges: boolean;
  changedFiles: string[];
  notes?: string[] | undefined;
}

export interface LoopRoleIdentity {
  role: LoopAgentRole;
  id: string;
  commandConfigured: boolean;
  canEdit: boolean;
  canVerifyCriteria: false;
  receivesHiddenReasoning: false;
  proofAuthority: "none";
}

export interface LoopRoundSnapshot {
  round: number;
  riskLevel: RiskLevel;
  mergeRiskScore: number;
  decayScore: number;
  securityScore: number;
  weakTestFindings: number;
  productFailureBundles: number;
  fixTasks: number;
  checkStatus: LoopCheckStatus;
  checksConfigured: boolean;
  checksTotal: number;
  riskReducedFromPreviousRound?: boolean | undefined;
  postAgentVerification?: LoopVerificationSnapshot | undefined;
  planOnlyBundle?: string | undefined;
  agent?: LoopAgentResult | undefined;
  builder?: LoopAgentResult | undefined;
  verifier?: LoopAgentResult | undefined;
  stateMachine?: LoopStateMachineSnapshot | undefined;
  requirementStatuses?: LoopRequirementStatusSnapshot[] | undefined;
  agentRequirementEdits?: LoopAgentRequirementEdit[] | undefined;
}

export interface LoopStateMachineSnapshot {
  schemaVersion: 1;
  phase: LoopStateMachinePhase;
  changedTreeFingerprint: string;
  requirementStatuses: LoopRequirementStatusSnapshot[];
  hypothesisStatuses: LoopHypothesisStatusSnapshot[];
  experimentStatuses: LoopExperimentStatusSnapshot[];
  unresolvedHumanDecisions: string[];
  decisions: LoopDecisionSnapshot[];
}

export interface LoopHypothesisStatusSnapshot {
  hypothesisId: string;
  status: "candidate" | "planned" | "confirmed" | "refuted" | "inconclusive" | "needs-human";
}

export interface LoopExperimentStatusSnapshot {
  experimentId: string;
  status: "not-run" | "passed" | "failed" | "blocked" | "needs-human";
}

export interface LoopDecisionSnapshot {
  phase: LoopStateMachinePhase;
  actor: "codedecay" | LoopAgentRole;
  summary: string;
  evidenceIds: string[];
}

export interface LoopRequirementStatusSnapshot {
  requirementId: string;
  status: RequirementTraceStatus;
}

export interface LoopAgentRequirementEdit {
  file: string;
  requirementIds: string[];
  trusted: false;
}

export interface LoopVerificationSnapshot {
  riskLevel: RiskLevel;
  mergeRiskScore: number;
  decayScore: number;
  securityScore: number;
  weakTestFindings: number;
  productFailureBundles: number;
  fixTasks: number;
  checkStatus: LoopCheckStatus;
  checksConfigured: boolean;
  checksTotal: number;
  requirementStatuses?: LoopRequirementStatusSnapshot[] | undefined;
}

export interface LoopReport {
  tool: "CodeDecay";
  mode: "closed-loop";
  version: string;
  generatedAt: string;
  status: LoopStatus;
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  maxRounds: number;
  roundsRun: number;
  planOnly: boolean;
  finalRiskLevel: RiskLevel;
  finalMergeRiskScore: number;
  finalDecayScore: number;
  finalSecurityScore: number;
  finalWeakTestFindings: number;
  finalProductFailureBundles: number;
  finalCheckStatus: LoopCheckStatus;
  roles: LoopRoleIdentity[];
  stateMachine: LoopStateMachineSnapshot;
  verdict: LoopVerdictEvidence;
  finalFixTasks: LoopFixTask[];
  requirementTrace?: RequirementTraceGraph | undefined;
  rounds: LoopRoundSnapshot[];
  nextSteps: string[];
  auditPath?: string | undefined;
  stopReason?: string | undefined;
  safety: {
    commandsExecuted: boolean;
    agentCommandConfigured: boolean;
    builderCommandConfigured: boolean;
    verifierCommandConfigured: boolean;
    llmCalled: boolean;
    telemetrySent: false;
    cloudDependency: false;
    autoCommitted: false;
    autoPushed: false;
  };
}

export interface LoopVerdictEvidence {
  status: LoopStatus;
  riskAllowed: boolean;
  weakTestsClear: boolean;
  checksPassed: boolean;
  checksConfigured: boolean;
  securityScoreAllowed: boolean;
  securityScore: number;
  securityScoreThreshold: number;
  highFindingCount: number;
  highSecurityFindingCount: number;
  securityMatchersRan: boolean;
  securityMatcherFindings: number;
  securityMatcherHighFindings: number;
  verifiedBy: string[];
  missingDepth: string[];
  blockingReasons: string[];
  requirementsSatisfied: boolean;
  blockingRequirementIds: string[];
}

export interface CodeDecayLoopInput {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  maxRounds?: number | undefined;
  agentCommand?: string | undefined;
  builderCommand?: string | undefined;
  verifierCommand?: string | undefined;
  builderIdentity?: string | undefined;
  verifierIdentity?: string | undefined;
  safeRiskLevel?: RiskLevel | undefined;
  securityScoreThreshold?: number | undefined;
  agentTimeoutMs: number;
  commandSafety: SafeCommandPolicy;
  maxWallTimeMs?: number | undefined;
  maxChangedFiles?: number | undefined;
  maxModelCalls?: number | undefined;
  allowedPathPrefixes?: string[] | undefined;
  protectedPathPrefixes?: string[] | undefined;
  auditPath?: string | undefined;
  resumeFromAuditPath?: string | undefined;
  runId?: string | undefined;
  createRedteamReport(): Promise<LoopRedteamReport>;
  renderAgentBundle(report: LoopRedteamReport): string;
  renderBuilderBundle?: ((report: LoopRedteamReport) => string) | undefined;
  renderVerifierBundle?: ((report: LoopRedteamReport) => string) | undefined;
  runConfiguredChecks(): Promise<LoopCheckSnapshot>;
  getChangedFiles(): FileChange[];
  now?: () => Date;
}

export interface DriveAgentInput {
  cwd: string;
  command: string;
  bundle: string;
  timeoutMs: number;
  safety: SafeCommandPolicy;
}
