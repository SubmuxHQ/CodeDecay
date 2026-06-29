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

export type HarnessCapability =
  | "agent-reasoning"
  | "test-execution"
  | "browser-flow"
  | "api-fuzzing"
  | "static-analysis"
  | "mutation-testing"
  | "contract-testing"
  | "coverage"
  | "memory"
  | "impact-map"
  | "execution";

export type HarnessFailureMode =
  | "missing-tool"
  | "missing-config"
  | "command-denied"
  | "timeout"
  | "nonzero-exit"
  | "network-required"
  | "unsafe-command"
  | "model-unavailable"
  | "tool-finding"
  | "no-evidence"
  | "internal-error";

export type HarnessRunStatus = "passed" | "failed" | "skipped" | "error" | "timed_out";

export interface ConfigRequirement {
  key: string;
  description: string;
  required: boolean;
}

export interface HarnessPlanInput {
  cwd: string;
  base?: string | undefined;
  head?: string | undefined;
  evidence: Evidence[];
  context?: Record<string, unknown> | undefined;
}

export interface HarnessPlanStep {
  id: string;
  title: string;
  description?: string | undefined;
}

export interface HarnessPlan {
  id: string;
  harnessName: string;
  summary: string;
  steps: HarnessPlanStep[];
  requiresApproval: boolean;
}

export interface HarnessRunContext {
  cwd: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  context?: Record<string, unknown> | undefined;
}

export interface HarnessFailure {
  mode: HarnessFailureMode;
  message: string;
  evidence?: Evidence[] | undefined;
}

export interface HarnessArtifact {
  path: string;
  description?: string | undefined;
}

export interface HarnessRunResult {
  harnessName: string;
  status: HarnessRunStatus;
  durationMs: number;
  evidence: Evidence[];
  artifacts: HarnessArtifact[];
  summary?: string | undefined;
  failure?: HarnessFailure | undefined;
}

export interface HarnessSummary {
  harnessName: string;
  status: HarnessRunStatus;
  summary: string;
  evidenceCount: number;
  failure?: HarnessFailure | undefined;
}

export interface CodeDecayHarness {
  name: string;
  capabilities: HarnessCapability[];
  requiredConfig: ConfigRequirement[];
  plan(input: HarnessPlanInput): Promise<HarnessPlan>;
  run(plan: HarnessPlan, context: HarnessRunContext): Promise<HarnessRunResult>;
  collectEvidence(result: HarnessRunResult): Promise<Evidence[]>;
  summarize(evidence: Evidence[]): Promise<HarnessSummary>;
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
