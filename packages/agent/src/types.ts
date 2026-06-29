import type { ImpactedRoute, ProductFailureBundle, RiskLevel } from "@submuxhq/codedecay-core";
import type { RedteamFixTask, RedteamReport, RedteamSkillSummary } from "@submuxhq/codedecay-redteam";
import type { AgentProfile, AgentProfileId } from "./profiles";

export type AgentTaskBundleFormat = "json" | "markdown";

export interface CreateAgentTaskBundleOptions {
  profile?: AgentProfileId | undefined;
}

export interface AgentTaskBundle {
  tool: "CodeDecay";
  version: string;
  mode: "agent-task-bundle";
  generatedAt: string;
  purpose: string;
  agentProfile: AgentProfile;
  summary: AgentTaskSummary;
  prompt: string;
  instructions: string[];
  evidence: AgentEvidence;
  tasks: RedteamFixTask[];
  suggestedChecks: AgentSuggestedCheck[];
  skills: RedteamSkillSummary[];
  safety: AgentSafetySummary;
  limits: string[];
}

export interface AgentTaskSummary {
  riskLevel: RiskLevel;
  mergeRiskScore: number;
  decayScore: number;
  changedFiles: number;
  impactedAreas: number;
  impactedRoutes: number;
  missingTestFindings: number;
  weakTestFindings: number;
  testProofStatus: string;
  edgeCases: number;
  productFailureBundles: number;
  fixTasks: number;
}

export interface AgentEvidence {
  changedFiles: AgentChangedFile[];
  impactedAreas: AgentImpactedArea[];
  impactedRoutes: AgentImpactedRoute[];
  weakTestFindings: AgentFindingEvidence[];
  missingTestFindings: AgentFindingEvidence[];
  edgeCases: string[];
  productFailureBundles: ProductFailureBundle[];
  memory: RedteamReport["memory"];
}

export interface AgentChangedFile {
  path: string;
  status: string;
}

export interface AgentImpactedArea {
  kind: string;
  name: string;
  risk: RiskLevel;
  files: string[];
}

export interface AgentImpactedRoute {
  framework: ImpactedRoute["framework"];
  kind: ImpactedRoute["kind"];
  route: string;
  methods: string[];
  risk: RiskLevel;
  files: string[];
  reasons: string[];
  recommendedTests: string[];
}

export interface AgentFindingEvidence {
  title: string;
  severity: RiskLevel;
  description: string;
  file?: string | undefined;
  line?: number | undefined;
  ruleId: string;
}

export interface AgentSuggestedCheck {
  source: "configured-command" | "tool-adapter";
  name: string;
  kind: string;
  command: string;
  willRun: false;
}

export interface AgentSafetySummary {
  llmCalled: false;
  commandsExecuted: false;
  telemetrySent: false;
  cloudDependency: false;
  agentOutputTrusted: false;
}
