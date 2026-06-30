import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { CodeDecayReport, Finding, ImpactedArea, RiskLevel } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { LoadedCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export type RedteamFormat = "json" | "markdown";
export type RedteamMode = "deterministic";
export type RedteamCheckKind = "test" | "build" | "start" | "probe";
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
  commandsExecuted: false;
  llmCalled: boolean;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
}
