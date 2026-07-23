import type {
  ChangedPathTestProofEntry,
  ImpactedRoute,
  ProductFailureBundle,
  RequirementContext,
  RequirementTraceGraph,
  RiskLevel,
  SymbolImpact
} from "@submuxhq/codedecay-core";
import type { RedteamFixTask, RedteamReport, RedteamSkillSummary, RedteamTaskSource } from "@submuxhq/codedecay-redteam";
import type { AgentProfile, AgentProfileId } from "./profiles";

export type AgentTaskBundleFormat = "json" | "markdown";
export type AgentTaskStatus = "clean" | "tasks-remaining" | "improved" | "regressed";

export interface CreateAgentTaskBundleOptions {
  profile?: AgentProfileId | undefined;
  taskFilters?: AgentTaskFilters | undefined;
}

export interface AgentTaskFilters {
  source?: RedteamTaskSource | undefined;
  priority?: RiskLevel | undefined;
  file?: string | undefined;
}

export interface AgentTaskBundle {
  tool: "CodeDecay";
  version: string;
  mode: "agent-task-bundle";
  status: AgentTaskStatus;
  generatedAt: string;
  purpose: string;
  agentProfile: AgentProfile;
  requirements?: RequirementContext | undefined;
  requirementTrace?: RequirementTraceGraph | undefined;
  investigation?: RedteamReport["investigation"] | undefined;
  summary: AgentTaskSummary;
  prompt: string;
  instructions: string[];
  evidence: AgentEvidence;
  tasks: RedteamFixTask[];
  taskFilters: AgentTaskFilters;
  suggestedChecks: AgentSuggestedCheck[];
  skills: RedteamSkillSummary[];
  safety: AgentSafetySummary;
  limits: string[];
}

export interface AgentTaskSummary {
  riskLevel: RiskLevel;
  mergeRiskScore: number;
  decayScore: number;
  securityScore: number;
  changedFiles: number;
  impactedAreas: number;
  impactedRoutes: number;
  symbolImpacts: number;
  testProofEntries: number;
  missingTestFindings: number;
  weakTestFindings: number;
  testProofStatus: string;
  edgeCases: number;
  productFailureBundles: number;
  fixTasks: number;
  totalFixTasks: number;
  scopeFindings: number;
  contractFindings: number;
}

export interface AgentEvidence {
  changedFiles: AgentChangedFile[];
  impactedAreas: AgentImpactedArea[];
  impactedRoutes: AgentImpactedRoute[];
  symbolImpacts: AgentSymbolImpact[];
  testProofEntries: AgentTestProofEntry[];
  weakTestFindings: AgentFindingEvidence[];
  missingTestFindings: AgentFindingEvidence[];
  scopeFindings: AgentFindingEvidence[];
  contractFindings: AgentFindingEvidence[];
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

export interface AgentSymbolImpact {
  file: string;
  symbol: string;
  exportKind: SymbolImpact["exportKind"];
  line: number;
  importerFiles: string[];
  routeFiles: string[];
  likelyTests: string[];
  reasons: string[];
}

export interface AgentTestProofEntry {
  file: string;
  symbol?: string | undefined;
  status: ChangedPathTestProofEntry["status"];
  evidence: ChangedPathTestProofEntry["evidence"];
  proof: ChangedPathTestProofEntry["proof"];
  staticReferences: string[];
  routeFiles: string[];
  weakenedByMocks: string[];
  reasons: string[];
  repairTask: string;
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
  llmCalled: boolean;
  commandsExecuted: boolean;
  telemetrySent: false;
  cloudDependency: false;
  agentOutputTrusted: false;
}
