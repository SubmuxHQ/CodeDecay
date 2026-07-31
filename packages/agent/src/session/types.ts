import type { RequirementContext, RequirementContextInput, RequirementSource } from "@submuxhq/codedecay-core";
import type { AgentProfileId } from "../profiles";
import type {
  AgentPreflightConfigInput,
  AgentPreflightMemoryInput,
  AgentPreflightReport
} from "../preflight/types";

export const AGENT_SESSION_SCHEMA_VERSION = 1;
export const AGENT_SESSION_DIRECTORY = ".codedecay/local/agent-sessions";

export type AgentSessionOperation = "start" | "context" | "checkpoint" | "finish";
export type AgentSessionCheckpointKind = "plan" | "diff" | "finish";
export type AgentSessionStatus = "active" | "stale" | "needs-verification" | "finished";
export type AgentSessionEvidenceKind =
  | "preflight"
  | "task-context"
  | "redteam-report"
  | "checkpoint"
  | "verification-boundary";

export interface AgentSessionBudgets {
  maxContextNodes: number;
  maxPromptChars: number;
}

export interface AgentSessionRepositoryState {
  rootDir: string;
  baseRevision: string;
  headRevision: string;
  workingTreeFingerprint: string;
  dirtyFiles: string[];
  lastObservedAt: string;
}

export interface AgentSessionSafety {
  llmCalled: false;
  commandsExecuted: false;
  telemetrySent: false;
  cloudDependency: false;
  agentOutputTrusted: false;
  secretsRedacted: number;
}

export interface AgentSessionEvidenceRef {
  id: string;
  kind: AgentSessionEvidenceKind;
  label: string;
  createdAt: string;
  trustClass: "tool-evidence" | "agent-supplied-untrusted";
  summary: string;
  artifactPath?: string | undefined;
}

export interface AgentSessionCheckpoint {
  id: string;
  kind: AgentSessionCheckpointKind;
  createdAt: string;
  summary: string;
  agentText?: string | undefined;
  agentOutputTrusted: false;
  sourceRevision: string;
  workingTreeFingerprint: string;
  dirtyFiles: string[];
  staleComparedToPrevious: boolean;
  evidenceRefs: string[];
}

export interface AgentSessionVerificationBoundary {
  commandsExecuted: false;
  allowedChecks: string[];
  acceptanceCriteria: Array<{
    id: string;
    text: string;
    requiredProof: string[];
    status: "needs-proof" | "not-specified";
  }>;
  verdict: "needs-verification" | "finished-with-limitations";
  notes: string[];
}

export interface AgentSession {
  schemaVersion: typeof AGENT_SESSION_SCHEMA_VERSION;
  tool: "CodeDecay";
  version: string;
  mode: "agent-session";
  id: string;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
  task: string;
  requirements: RequirementContext;
  profile: AgentProfileId;
  budgets: AgentSessionBudgets;
  repository: AgentSessionRepositoryState;
  checkpoints: AgentSessionCheckpoint[];
  evidenceRefs: AgentSessionEvidenceRef[];
  verification?: AgentSessionVerificationBoundary | undefined;
  safety: AgentSessionSafety;
  limits: string[];
}

export interface AgentSessionGitSnapshot {
  headRevision: string;
  workingTreeFingerprint: string;
  dirtyFiles: string[];
}

export interface AgentSessionEvidenceInput {
  kind: AgentSessionEvidenceKind;
  label: string;
  summary: string;
  artifactPath?: string | undefined;
  trustClass?: AgentSessionEvidenceRef["trustClass"] | undefined;
}

export interface AgentSessionStartOptions {
  rootDir: string;
  task: string;
  requirements?: RequirementContext | RequirementContextInput | undefined;
  requirementSource?: RequirementSource | undefined;
  repoFiles: string[];
  config?: AgentPreflightConfigInput | undefined;
  configSource?: string | undefined;
  memory?: AgentPreflightMemoryInput | undefined;
  memorySource?: string | undefined;
  sessionId?: string | undefined;
  profile?: AgentProfileId | undefined;
  maxContextNodes?: number | undefined;
  maxPromptChars?: number | undefined;
  generatedAt?: string | undefined;
}

export interface AgentSessionContextOptions {
  rootDir: string;
  sessionId: string;
  evidence?: AgentSessionEvidenceInput | undefined;
  generatedAt?: string | undefined;
}

export interface AgentSessionCheckpointOptions {
  rootDir: string;
  sessionId: string;
  kind: Exclude<AgentSessionCheckpointKind, "finish">;
  summary?: string | undefined;
  agentText?: string | undefined;
  evidence?: AgentSessionEvidenceInput[] | undefined;
  generatedAt?: string | undefined;
}

export interface AgentSessionFinishOptions {
  rootDir: string;
  sessionId: string;
  config?: AgentPreflightConfigInput | undefined;
  summary?: string | undefined;
  agentText?: string | undefined;
  evidence?: AgentSessionEvidenceInput[] | undefined;
  generatedAt?: string | undefined;
}

export interface AgentSessionGuidance {
  implementationBrief: string[];
  proofPlan: string[];
  agentInstructions: string[];
  nonGoals: string[];
  safetyConstraints: string[];
  configuredChecks: string[];
}

export interface AgentSessionResult {
  operation: AgentSessionOperation;
  sessionPath: string;
  session: AgentSession;
  stale: boolean;
  outOfBandEditsDetected: boolean;
  warnings: string[];
  guidance?: AgentSessionGuidance | undefined;
  preflightReport?: AgentPreflightReport | undefined;
  verification?: AgentSessionVerificationBoundary | undefined;
}
