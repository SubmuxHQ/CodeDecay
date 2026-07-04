import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { CodeDecayReport, Finding, ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { LoadedCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export type RedteamFormat = "json" | "markdown";
export type RedteamMode = "deterministic";
export type RedteamCheckKind = "test" | "build" | "start" | "probe";
export type RedteamExecutionStatus = "passed" | "failed" | "skipped" | "blocked" | "timed_out" | "error";
export type RedteamProofGrade =
  | "tool-evidence"
  | "deterministic-signal"
  | "missing-proof"
  | "memory-context"
  | "agent-suggestion";
export type RedteamVerificationStatus = "not-run" | "verified" | "unverified" | "failed" | "blocked";
export type RedteamInvestigationStatus = "disabled" | "completed" | "failed";
export type RedteamTaskSource =
  | "finding"
  | "weak-test"
  | "edge-case"
  | "configured-check"
  | "tool-adapter"
  | "memory"
  | "pattern"
  | "product-failure";

export interface RedteamReportInput {
  analysisReport: CodeDecayReport;
  config: CodeDecayConfig;
  memory: CodeDecayMemory;
  configSource?: string | undefined;
  memorySource?: string | undefined;
  memoryProviderSources?: RedteamMemoryProviderSource[] | undefined;
  skills?: LoadedCodeDecaySkills | undefined;
  investigation?: RedteamInvestigation | undefined;
  verification?: RedteamVerificationSummary | undefined;
  generatedAt?: string | undefined;
}

export interface RedteamReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  mode: RedteamMode;
  base?: string | undefined;
  head?: string | undefined;
  summary: RedteamSummary;
  analysis: CodeDecayReport;
  testAudit: TestProofAudit;
  weakTestFindings: Finding[];
  edgeCases: string[];
  configuredChecks: RedteamConfiguredCheck[];
  toolAdapterPlans: RedteamToolAdapterPlan[];
  patternInsights: RedteamPatternInsight[];
  memory: RedteamMemorySummary;
  skills: RedteamSkillSummary[];
  investigation?: RedteamInvestigation | undefined;
  verification: RedteamVerificationSummary;
  fixTasks: RedteamFixTask[];
  safety: RedteamSafetySummary;
}

export interface RedteamSummary {
  mergeRiskScore: number;
  decayScore: number;
  securityScore: number;
  riskLevel: RiskLevel;
  changedFiles: number;
  impactedAreas: number;
  impactedRoutes: number;
  findings: Record<RiskLevel, number>;
  missingTestFindings: number;
  weakTestFindings: number;
  testProofStatus: TestProofAudit["status"];
  edgeCases: number;
  configuredChecks: number;
  toolAdapters: number;
  patternInsights: number;
  productFailureBundles: number;
  verificationStatus: RedteamVerificationStatus;
  skills: number;
  fixTasks: number;
  investigationSuggestions: number;
  investigationLimitations: number;
}

export interface RedteamConfiguredCheck {
  kind: RedteamCheckKind;
  name: string;
  command: string;
  willRun: false;
  timeoutMs?: number | undefined;
}

export interface RedteamToolAdapterPlan {
  kind: ConfiguredToolAdapterKind;
  name: string;
  command: string;
  capabilities: string[];
  willRun: false;
  requiresApproval: boolean;
  timeoutMs?: number | undefined;
}

export interface RedteamVerificationSummary {
  status: RedteamVerificationStatus;
  commandsExecuted: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  timedOut: number;
  errors: number;
  durationMs: number;
  checks: RedteamVerificationCheck[];
  notes: string[];
}

export interface RedteamVerificationCheck {
  kind: RedteamCheckKind | ConfiguredToolAdapterKind;
  name: string;
  command: string;
  status: RedteamExecutionStatus;
  proof: RedteamProofGrade;
  summary: string;
  durationMs: number;
  exitCode?: number | undefined;
  failure?: string | undefined;
}

export interface RedteamMemorySummary {
  sourcePath?: string | undefined;
  flows: number;
  commands: number;
  invariants: number;
  architecture: number;
  regressions: number;
  providerSources?: RedteamMemoryProviderSource[] | undefined;
  providerFailures?: RedteamMemoryProviderSource[] | undefined;
}

export interface RedteamMemoryProviderSource {
  provider: string;
  kind: "local" | "external";
  status: "loaded" | "failed";
  sourcePath?: string | undefined;
  error?: string | undefined;
  untrusted: true;
}

export interface RedteamSkillSummary {
  id: string;
  title: string;
  path: string;
  summary: string;
  untrusted: true;
}

export interface RedteamPatternInsight {
  id: string;
  title: string;
  areas: string[];
  edgeCases: string[];
  weakTestSigns: string[];
  suggestedChecks: string[];
  citations: Array<{ title: string; url: string }>;
  trust: "pattern-pack";
  proof: "suggestion";
}

export interface RedteamInvestigationSuggestion {
  title: string;
  detail: string;
  severity?: RiskLevel | undefined;
  evidence?: string[] | undefined;
}

export interface RedteamInvestigationProvider {
  configuredProvider: "disabled" | "ollama" | "litellm";
  id?: string | undefined;
  model?: string | undefined;
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  timeoutMs: number;
}

export interface RedteamInvestigation {
  status: RedteamInvestigationStatus;
  provider: RedteamInvestigationProvider;
  suggestions: RedteamInvestigationSuggestion[];
  limitations: string[];
  rawText?: string | undefined;
  untrusted: true;
  llmCalled: boolean;
}

export interface RedteamFixTask {
  title: string;
  priority: RiskLevel;
  source: RedteamTaskSource;
  proof: RedteamProofGrade;
  detail: string;
  file?: string | undefined;
  line?: number | undefined;
  scope?: RedteamFixTaskScope | undefined;
}

export interface RedteamFixTaskScope {
  files: string[];
  areas: ImpactedArea["kind"][];
}

export interface RedteamSafetySummary {
  commandsExecuted: boolean;
  llmCalled: boolean;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
}
