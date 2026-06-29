import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { CodeDecayReport, Finding, RiskLevel } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { LoadedCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import type { ConfiguredToolAdapterKind } from "@submuxhq/codedecay-tool-adapters";

export type RedteamFormat = "json" | "markdown";
export type RedteamMode = "deterministic";
export type RedteamCheckKind = "test" | "build" | "start" | "probe";
export type RedteamTaskSource =
  | "finding"
  | "weak-test"
  | "edge-case"
  | "configured-check"
  | "tool-adapter"
  | "memory"
  | "product-failure";

export interface RedteamReportInput {
  analysisReport: CodeDecayReport;
  config: CodeDecayConfig;
  memory: CodeDecayMemory;
  configSource?: string | undefined;
  memorySource?: string | undefined;
  skills?: LoadedCodeDecaySkills | undefined;
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
  memory: RedteamMemorySummary;
  skills: RedteamSkillSummary[];
  fixTasks: RedteamFixTask[];
  safety: RedteamSafetySummary;
}

export interface RedteamSummary {
  mergeRiskScore: number;
  decayScore: number;
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
  productFailureBundles: number;
  skills: number;
  fixTasks: number;
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
}

export interface RedteamSkillSummary {
  id: string;
  title: string;
  path: string;
  summary: string;
  untrusted: true;
}

export interface RedteamFixTask {
  title: string;
  priority: RiskLevel;
  source: RedteamTaskSource;
  detail: string;
  file?: string | undefined;
  line?: number | undefined;
}

export interface RedteamSafetySummary {
  commandsExecuted: false;
  llmCalled: false;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
}
