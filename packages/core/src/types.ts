import type { RiskLevel } from "./risk";
import type { ScoreBreakdown } from "./scoring";
import type { ProductFailureBundle } from "./product-failures/types";

export {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH
} from "./product-failures/types";
export type {
  ProductCheckKind,
  ProductFailureArtifact,
  ProductFailureArtifactKind,
  ProductFailureBundle,
  ProductFailureClassification,
  ProductFailureStep,
  ProductFailureTarget
} from "./product-failures/types";

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
