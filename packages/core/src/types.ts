import type { RiskLevel } from "./risk";
import type { ScoreBreakdown } from "./scoring";

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export type FindingCategory =
  | "regression"
  | "coverage"
  | "decay"
  | "scope"
  | "configuration";

export interface ChangedLine {
  line: number;
  content: string;
}

export interface FileChange {
  path: string;
  oldPath?: string | undefined;
  status: FileStatus;
  additions: number;
  deletions: number;
  addedLines: ChangedLine[];
}

export interface ImpactedArea {
  name: string;
  kind: "api" | "ui" | "database" | "auth" | "config" | "test" | "source" | "docs";
  risk: RiskLevel;
  files: string[];
}

export interface ImpactedRoute {
  framework: "nextjs" | "express" | "fastify" | "node";
  kind: "ui-route" | "api-route" | "middleware" | "route-handler";
  route: string;
  methods: string[];
  files: string[];
  risk: RiskLevel;
  reasons: string[];
  recommendedTests: string[];
}

export interface Finding {
  ruleId: string;
  title: string;
  description: string;
  severity: RiskLevel;
  category: FindingCategory;
  file?: string | undefined;
  line?: number | undefined;
}

export interface AnalyzerResult {
  findings: Finding[];
  impactedAreas: ImpactedArea[];
  impactedRoutes?: ImpactedRoute[] | undefined;
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
}

export type RuntimeCoverageSourceKind = "istanbul" | "lcov" | "v8";

export interface TestEvidenceSource {
  kind: RuntimeCoverageSourceKind;
  path: string;
}

export type ChangedSourceCoverageStatus = "covered" | "partial" | "not_covered" | "not_measured";

export interface ChangedSourceCoverage {
  path: string;
  status: ChangedSourceCoverageStatus;
  measuredLines: number[];
  coveredLines: number[];
  uncoveredLines: number[];
  sourceKinds: RuntimeCoverageSourceKind[];
  sourcePaths: string[];
}

export type TestEvidenceMode = "heuristic_only" | "runtime_augmented";

export interface TestEvidenceSummary {
  mode: TestEvidenceMode;
  sources: TestEvidenceSource[];
  changedSources: ChangedSourceCoverage[];
  notes: string[];
}

export type ProductCheckKind = "ui" | "api" | "workflow";

export type ProductFailureClassification =
  | "confirmed-regression"
  | "likely-flaky"
  | "environment-failure"
  | "auth-or-test-data-failure"
  | "generated-test-weakness"
  | "unknown";

export interface ProductFailureTarget {
  id: string;
  environment?: string | undefined;
  baseUrl?: string | undefined;
}

export interface ProductFailureStep {
  index: number;
  label: string;
  status: "passed" | "failed" | "skipped";
  expected?: string | undefined;
  actual?: string | undefined;
}

export type ProductFailureArtifactKind =
  | "screenshot"
  | "trace"
  | "video"
  | "dom-snapshot"
  | "console-log"
  | "network-log"
  | "test-source"
  | "request-response-diff"
  | "other";

export interface ProductFailureArtifact {
  kind: ProductFailureArtifactKind;
  path?: string | undefined;
  label?: string | undefined;
  description?: string | undefined;
}

export interface ProductFailureBundle {
  schemaVersion: 1;
  id: string;
  checkId: string;
  checkKind: ProductCheckKind;
  priority: RiskLevel;
  target: ProductFailureTarget;
  title: string;
  summary: string;
  classification: ProductFailureClassification;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  failedStep: ProductFailureStep;
  neighboringSteps: ProductFailureStep[];
  artifacts: ProductFailureArtifact[];
  expected: string;
  actual: string;
  impactedFiles: string[];
  rootCauseHypothesis?: string | undefined;
  suggestedFixTasks: string[];
  rerunCommand: string;
}

export const CODEDECAY_PRODUCT_LATEST_REPORT_PATH = ".codedecay/local/product-runs/latest.json";

export interface ReportSummary {
  mergeRiskScore: number;
  decayScore: number;
  riskLevel: RiskLevel;
  findingCounts: Record<RiskLevel, number>;
  mergeRiskBreakdown?: ScoreBreakdown | undefined;
  decayBreakdown?: ScoreBreakdown | undefined;
}

export interface CodeDecayReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  base?: string | undefined;
  head?: string | undefined;
  summary: ReportSummary;
  changedFiles: FileChange[];
  impactedAreas: ImpactedArea[];
  impactedRoutes?: ImpactedRoute[] | undefined;
  findings: Finding[];
  recommendedTests: string[];
  testEvidence?: TestEvidenceSummary | undefined;
  productFailureBundles?: ProductFailureBundle[] | undefined;
}
