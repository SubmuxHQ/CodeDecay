import type { CommandExecutionResult, SafeCommandPolicy } from "@submuxhq/codedecay-execution";
import type { FileChange, RiskLevel } from "@submuxhq/codedecay-core";

export type LoopStatus =
  | "merge-safe"
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
    weakTestFindings: number;
    fixTasks: number;
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
  note?: string | undefined;
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
  finalWeakTestFindings: number;
  finalCheckStatus: LoopCheckStatus;
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

export interface CodeDecayLoopInput {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  maxRounds?: number | undefined;
  agentCommand?: string | undefined;
  safeRiskLevel?: RiskLevel | undefined;
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
