import type {
  ProductCheckKind,
  ProductFailureClassification,
  RiskLevel
} from "@submuxhq/codedecay-core";
import type { ProductTargetStatus } from "../../types";

export interface ProductDashboard {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  outputDir: string;
  summary: ProductDashboardSummary;
  runs: ProductDashboardRun[];
  failures: ProductDashboardFailure[];
}

export interface ProductDashboardSummary {
  runs: number;
  targets: number;
  passed: number;
  failed: number;
  blocked: number;
  timedOut: number;
  skipped: number;
  failures: number;
  flaky: number;
  confirmedRegressions: number;
}

export interface ProductDashboardRun {
  id: string;
  sourcePath: string;
  generatedAt?: string | undefined;
  status: ProductTargetStatus;
  durationMs?: number | undefined;
  targets: string[];
  passed: number;
  failed: number;
  blocked: number;
  timedOut: number;
  skipped: number;
}

export interface ProductDashboardFailure {
  id: string;
  runId: string;
  title: string;
  targetId: string;
  checkId: string;
  checkKind: ProductCheckKind;
  priority: RiskLevel;
  classification: ProductFailureClassification;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  summary: string;
  expected: string;
  actual: string;
  impactedFiles: string[];
  rerunCommand: string;
  jsonPath: string;
  markdownPath: string;
}
