import type { RiskLevel } from "../risk";

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
