import type {
  DesignContract,
  ImpactedArea,
  RequirementContext,
  RequirementContextInput,
  RequirementSource,
  RiskLevel
} from "@submuxhq/codedecay-core";
import type { AgentSuggestedCheck, AgentTaskBundleFormat } from "../types";

export type AgentPreflightFormat = AgentTaskBundleFormat;
export type AgentPreflightAreaKind = ImpactedArea["kind"];
export type AgentPreflightRouteKind = "api-route" | "ui-route" | "product-api";
export type AgentPreflightConfidence = "low" | "medium" | "high";

export interface AgentPreflightReport {
  tool: "CodeDecay";
  version: string;
  mode: "agent-preflight";
  generatedAt: string;
  task: string;
  requirements: RequirementContext;
  summary: AgentPreflightSummary;
  deterministicEvidence: AgentPreflightEvidence;
  suggestions: AgentPreflightSuggestions;
  safety: AgentPreflightSafety;
  limits: string[];
}

export interface AgentPreflightSummary {
  confidence: AgentPreflightConfidence;
  likelyAreas: number;
  candidateFiles: number;
  candidateRoutes: number;
  memoryMatches: number;
  designConstraints: number;
  configuredChecks: number;
  acceptanceCriteria: number;
  unresolvedQuestions: number;
  insufficientContext: boolean;
}

export interface AgentPreflightEvidence {
  rootDir: string;
  configSource?: string | undefined;
  memorySource?: string | undefined;
  taskSignals: AgentPreflightTaskSignals;
  likelyAreas: AgentPreflightArea[];
  candidateFiles: AgentPreflightCandidateFile[];
  candidateRoutes: AgentPreflightCandidateRoute[];
  memory: AgentPreflightMemoryEvidence;
  designConstraints: AgentPreflightDesignConstraint[];
  configuredChecks: AgentSuggestedCheck[];
}

export interface AgentPreflightTaskSignals {
  tokens: string[];
  matchedKeywords: AgentPreflightKeywordMatch[];
  noDiffRequired: true;
}

export interface AgentPreflightKeywordMatch {
  area: AgentPreflightAreaKind;
  keywords: string[];
}

export interface AgentPreflightArea {
  kind: AgentPreflightAreaKind;
  name: string;
  confidence: AgentPreflightConfidence;
  reasons: string[];
}

export interface AgentPreflightCandidateFile {
  path: string;
  areas: AgentPreflightAreaKind[];
  reasons: string[];
}

export interface AgentPreflightCandidateRoute {
  route: string;
  kind: AgentPreflightRouteKind;
  methods: string[];
  files: string[];
  reasons: string[];
}

export interface AgentPreflightMemoryEvidence {
  flows: AgentPreflightMemoryMatch[];
  commands: AgentPreflightMemoryCommandMatch[];
  invariants: AgentPreflightMemorySeverityMatch[];
  architecture: AgentPreflightMemoryMatch[];
  regressions: AgentPreflightMemorySeverityMatch[];
}

export interface AgentPreflightMemoryMatch {
  title: string;
  description?: string | undefined;
  matchReasons: string[];
}

export interface AgentPreflightMemoryCommandMatch extends AgentPreflightMemoryMatch {
  command: string;
}

export interface AgentPreflightMemorySeverityMatch extends AgentPreflightMemoryMatch {
  severity?: RiskLevel | undefined;
}

export type AgentPreflightDesignConstraintKind =
  | "scope-fence"
  | "boundary-rule"
  | "dependency-rule"
  | "banned-api"
  | "pattern-rule";

export interface AgentPreflightDesignConstraint {
  kind: AgentPreflightDesignConstraintKind;
  id: string;
  name?: string | undefined;
  severity?: RiskLevel | undefined;
  message?: string | undefined;
  rewrite?: string | undefined;
  allowedFiles?: string[] | undefined;
  allowedAreas?: AgentPreflightAreaKind[] | undefined;
  files?: string[] | undefined;
  areas?: AgentPreflightAreaKind[] | undefined;
  productPaths?: string[] | undefined;
  reason: string;
}

export interface AgentPreflightSuggestions {
  implementationBrief: string[];
  proofPlan: string[];
  agentInstructions: string[];
  nonGoals: string[];
  safetyConstraints: string[];
}

export interface AgentPreflightSafety {
  llmCalled: false;
  commandsExecuted: false;
  telemetrySent: false;
  cloudDependency: false;
  agentOutputTrusted: false;
}

export interface CreateAgentPreflightReportOptions {
  task: string;
  requirements?: RequirementContext | RequirementContextInput | undefined;
  requirementSource?: RequirementSource | undefined;
  rootDir: string;
  repoFiles: string[];
  config?: AgentPreflightConfigInput | undefined;
  configSource?: string | undefined;
  memory?: AgentPreflightMemoryInput | undefined;
  memorySource?: string | undefined;
  generatedAt?: string | undefined;
}

export interface AgentPreflightConfigInput {
  commands?: Partial<Record<"test" | "build" | "start", string[]>> | undefined;
  probes?: AgentPreflightProbeInput[] | undefined;
  toolAdapters?: AgentPreflightToolAdaptersInput | undefined;
  productTesting?: AgentPreflightProductTestingInput | undefined;
  designContract?: DesignContract | undefined;
}

export interface AgentPreflightToolAdaptersInput {
  agentProcess?: AgentPreflightToolAdapterInput | undefined;
  playwright?: AgentPreflightToolAdapterInput | undefined;
  stryker?: AgentPreflightToolAdapterInput | undefined;
  schemathesis?: AgentPreflightToolAdapterInput | undefined;
  pact?: AgentPreflightToolAdapterInput | undefined;
  semgrep?: AgentPreflightToolAdapterInput | undefined;
  coverage?: AgentPreflightToolAdapterInput | undefined;
}

export interface AgentPreflightProbeInput {
  name: string;
  command: string;
}

export interface AgentPreflightToolAdapterInput {
  enabled?: boolean | undefined;
  command?: string | undefined;
}

export interface AgentPreflightProductTestingInput {
  targets?: Record<string, AgentPreflightProductTargetInput | undefined> | undefined;
}

export interface AgentPreflightProductTargetInput {
  apiEndpoints?: AgentPreflightProductApiEndpointInput[] | undefined;
}

export interface AgentPreflightProductApiEndpointInput {
  id?: string | undefined;
  method: string;
  path: string;
}

export interface AgentPreflightMemoryInput {
  flows?: AgentPreflightFlowInput[] | undefined;
  commands?: AgentPreflightCommandInput[] | undefined;
  invariants?: AgentPreflightInvariantInput[] | undefined;
  architecture?: AgentPreflightArchitectureInput[] | undefined;
  regressions?: AgentPreflightRegressionInput[] | undefined;
}

export interface AgentPreflightMatcherInput {
  files?: string[] | undefined;
  areas?: AgentPreflightAreaKind[] | undefined;
  productPaths?: string[] | undefined;
}

export interface AgentPreflightFlowInput extends AgentPreflightMatcherInput {
  name: string;
  description?: string | undefined;
  checks?: string[] | undefined;
}

export interface AgentPreflightCommandInput extends AgentPreflightMatcherInput {
  name: string;
  command: string;
  description?: string | undefined;
}

export interface AgentPreflightInvariantInput extends AgentPreflightMatcherInput {
  name: string;
  description: string;
  severity?: RiskLevel | undefined;
}

export interface AgentPreflightArchitectureInput extends AgentPreflightMatcherInput {
  title: string;
  note: string;
}

export interface AgentPreflightRegressionInput extends AgentPreflightMatcherInput {
  title: string;
  description: string;
  check?: string | undefined;
  severity?: RiskLevel | undefined;
}
