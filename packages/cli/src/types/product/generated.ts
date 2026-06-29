import type { ProductFailureClassification } from "@submuxhq/codedecay-core";
import type { ProductTargetStatus } from "./status";

export interface ProductGeneratedTestsResult {
  status: ProductTargetStatus;
  sourcePath?: string | undefined;
  manifestPath?: string | undefined;
  tests: ProductGeneratedTestCase[];
  durationMs: number;
  error?: string | undefined;
  notes: string[];
}

export interface ProductGeneratedTestCase {
  id: string;
  title: string;
  kind: "route-load" | "link-navigation" | "input-state" | "form-visibility" | "api-operation";
  pageUrl: string;
  selector?: string | undefined;
  targetUrl?: string | undefined;
  method?: string | undefined;
  operationPath?: string | undefined;
  operationId?: string | undefined;
  expectedStatuses?: number[] | undefined;
  headers?: Record<string, string> | undefined;
  requestBody?: unknown;
  destructive?: boolean | undefined;
  priority: "high" | "medium" | "low";
}

export interface ProductGeneratedTestManifest {
  schemaVersion: 1;
  generatedAt: string;
  target: {
    id: string;
    baseUrl: string;
  };
  sourceFlowMapPath?: string | undefined;
  sourceOpenApiSchemaPath?: string | undefined;
  sourceApiEndpoints?: string | undefined;
  testSourcePath: string;
  reviewRequired: true;
  promoteByCopyingTo: string;
  tests: ProductGeneratedTestCase[];
}

export interface ProductGeneratedTestRunResult {
  status: ProductTargetStatus;
  command?: string | undefined;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: ProductGeneratedTestFailure[];
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  notes: string[];
}

export interface ProductGeneratedTestFailure {
  testId?: string | undefined;
  title: string;
  failingStep: string;
  error: string;
  retryEvidence?: ProductGeneratedTestRetryEvidence | undefined;
  classification?: ProductFailureClassification | undefined;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  suggestedFixTasks?: string[] | undefined;
  request?: ProductGeneratedTestFailureRequest | undefined;
  expected?: string | undefined;
  actual?: string | undefined;
  impactedFiles?: string[] | undefined;
  testSourcePath: string;
  testSource: string;
  rerunCommand: string;
}

export interface ProductGeneratedTestRetryEvidence {
  attempts: number;
  passed: number;
  failed: number;
  command?: string | undefined;
  conclusion: "passed-on-rerun" | "failed-on-rerun" | "not-rerun";
  error?: string | undefined;
}

export interface ProductGeneratedTestFailureRequest {
  method: string;
  url: string;
}
