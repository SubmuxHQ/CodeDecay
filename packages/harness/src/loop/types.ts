import type { CommandExecutionResult, SafeCommandPolicy } from "@submuxhq/codedecay-execution";
import type { FileChange, RiskLevel } from "@submuxhq/codedecay-core";

export type LoopStatus =
  | "merge-safe-verified"
  | "merge-safe-shallow"
  | "unverified"
  | "stuck"
  | "needs-human"
  | "plan-only"
  | "agent-error";

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
    securityScore: number;
    weakTestFindings: number;
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
  safety: {
    commandsExecuted: false;
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
  command: string;
  status: CommandExecutionResult["status"];
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  madeChanges: boolean;
  changedFiles: string[];
}

export interface LoopRoundSnapshot {
  round: number;
  riskLevel: RiskLevel;
  mergeRiskScore: number;
  weakTestFindings: number;
  fixTasks: number;
  checkStatus: LoopCheckStatus;
  checksConfigured: boolean;
  checksTotal: number;
  riskReducedFromPreviousRound?: boolean | undefined;
  planOnlyBundle?: string | undefined;
  agent?: LoopAgentResult | undefined;
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
  finalSecurityScore: number;
  finalWeakTestFindings: number;
  finalCheckStatus: LoopCheckStatus;
  verdict: LoopVerdictEvidence;
  finalFixTasks: LoopFixTask[];
  rounds: LoopRoundSnapshot[];
  nextSteps: string[];
  safety: {
    commandsExecuted: boolean;
    agentCommandConfigured: boolean;
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
}

export interface CodeDecayLoopInput {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  maxRounds?: number | undefined;
  agentCommand?: string | undefined;
  safeRiskLevel?: RiskLevel | undefined;
  securityScoreThreshold?: number | undefined;
  agentTimeoutMs: number;
  commandSafety: SafeCommandPolicy;
  createRedteamReport(): Promise<LoopRedteamReport>;
  renderAgentBundle(report: LoopRedteamReport): string;
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
