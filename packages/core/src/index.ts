import { compareRiskLevels, riskLevelFromScore, type RiskLevel } from "./risk";
import { calculateDecayBreakdown, calculateMergeRiskBreakdown, type ScoreBreakdown } from "./scoring";
import type {
  AnalyzerResult,
  CodeDecayReport,
  FileChange,
  Finding,
  ImpactedArea,
  ImpactedRoute,
  ProductCheckKind,
  ProductFailureArtifact,
  ProductFailureBundle,
  ProductFailureClassification
} from "./types";
import { CODEDECAY_VERSION } from "./version";

export { compareRiskLevels, riskLevelFromScore, shouldFailForRisk } from "./risk";
export type { RiskLevel } from "./risk";
export type { ScoreBreakdown, ScoreContributor, ScoreEvidenceKind } from "./scoring";
export { CODEDECAY_PRODUCT_LATEST_REPORT_PATH } from "./types";
export type {
  AnalyzerResult,
  ChangedLine,
  ChangedSourceCoverage,
  ChangedSourceCoverageStatus,
  CodeDecayReport,
  FileChange,
  FileStatus,
  Finding,
  FindingCategory,
  ImpactedArea,
  ImpactedRoute,
  ProductCheckKind,
  ProductFailureArtifact,
  ProductFailureArtifactKind,
  ProductFailureBundle,
  ProductFailureClassification,
  ProductFailureStep,
  ProductFailureTarget,
  ReportSummary,
  RuntimeCoverageSourceKind,
  TestEvidenceMode,
  TestEvidenceSource,
  TestEvidenceSummary
} from "./types";
export { CODEDECAY_VERSION } from "./version";

export function findingCounts(findings: Finding[]): Record<RiskLevel, number> {
  return findings.reduce<Record<RiskLevel, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { low: 0, medium: 0, high: 0 }
  );
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const severity = compareRiskLevels(right.severity, left.severity);
    if (severity !== 0) {
      return severity;
    }

    return left.ruleId.localeCompare(right.ruleId);
  });
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function createAnalysisReport(input: {
  base?: string | undefined;
  head?: string | undefined;
  changedFiles: FileChange[];
  analyzerResult: AnalyzerResult;
  productFailureBundles?: ProductFailureBundle[] | undefined;
  generatedAt?: string | undefined;
}): CodeDecayReport {
  const findings = sortFindings(input.analyzerResult.findings);
  const mergeRiskBreakdown = calculateMergeRiskBreakdown(findings, input.changedFiles);
  const decayBreakdown = calculateDecayBreakdown(findings, input.changedFiles);
  const mergeRiskScore = mergeRiskBreakdown.score;
  const decayScore = decayBreakdown.score;
  const riskLevel = riskLevelFromScore(Math.max(mergeRiskScore, decayScore));
  const impactedRoutes = mergeImpactedRoutes(input.analyzerResult.impactedRoutes ?? []);
  const routeRecommendedTests = impactedRoutes.flatMap((route) => route.recommendedTests);

  const report: CodeDecayReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      mergeRiskScore,
      decayScore,
      riskLevel,
      findingCounts: findingCounts(findings),
      mergeRiskBreakdown,
      decayBreakdown
    },
    changedFiles: input.changedFiles,
    impactedAreas: mergeImpactedAreas(input.analyzerResult.impactedAreas),
    findings,
    recommendedTests: dedupeStrings([...input.analyzerResult.recommendedTests, ...routeRecommendedTests])
  };

  if (impactedRoutes.length > 0) {
    report.impactedRoutes = impactedRoutes;
  }

  if (input.base) {
    report.base = input.base;
  }

  if (input.head) {
    report.head = input.head;
  }

  if (input.analyzerResult.testEvidence) {
    report.testEvidence = input.analyzerResult.testEvidence;
  }

  if (input.productFailureBundles && input.productFailureBundles.length > 0) {
    report.productFailureBundles = sortProductFailureBundles(input.productFailureBundles);
  }

  return report;
}

export function productFailureBundlesFromProductTargetReport(value: unknown): ProductFailureBundle[] {
  const report = asRecord(value);
  const targets = Array.isArray(report?.targets) ? report.targets : [];
  const bundles: ProductFailureBundle[] = [];

  for (const targetValue of targets) {
    const target = asRecord(targetValue);
    if (!target) {
      continue;
    }

    const generatedFailures = [
      ...productFailureBundlesFromGeneratedRun(target, "generatedTestRun", "ui"),
      ...productFailureBundlesFromGeneratedRun(target, "generatedApiTestRun", "api")
    ];
    bundles.push(...generatedFailures);

    if (generatedFailures.length === 0) {
      const setupFailure = productFailureBundleFromTargetStatus(target);
      if (setupFailure) {
        bundles.push(setupFailure);
      }
    }
  }

  return sortProductFailureBundles(bundles);
}

function sortProductFailureBundles(bundles: ProductFailureBundle[]): ProductFailureBundle[] {
  return [...bundles]
    .map((bundle) => ({
      ...bundle,
      neighboringSteps: [...bundle.neighboringSteps].sort((left, right) => left.index - right.index),
      artifacts: [...bundle.artifacts].sort((left, right) =>
        `${left.kind}:${left.path ?? ""}:${left.label ?? ""}`.localeCompare(`${right.kind}:${right.path ?? ""}:${right.label ?? ""}`)
      ),
      classificationEvidence:
        bundle.classificationEvidence && bundle.classificationEvidence.length > 0
          ? dedupeStrings(bundle.classificationEvidence)
          : undefined,
      impactedFiles: dedupeStrings(bundle.impactedFiles),
      suggestedFixTasks: dedupeStrings(bundle.suggestedFixTasks)
    }))
    .sort((left, right) => {
      const risk = compareRiskLevels(right.priority, left.priority);
      if (risk !== 0) {
        return risk;
      }

      return left.id.localeCompare(right.id);
    });
}

function productFailureBundlesFromGeneratedRun(
  target: Record<string, unknown>,
  runKey: "generatedTestRun" | "generatedApiTestRun",
  checkKind: ProductCheckKind
): ProductFailureBundle[] {
  const run = asRecord(target[runKey]);
  const failures = Array.isArray(run?.failures) ? run.failures : [];
  const targetId = stringValue(target.id) ?? "product";
  const targetBaseUrl = stringValue(target.baseUrl);
  const bundles: ProductFailureBundle[] = [];

  for (const failureValue of failures) {
    const failure = asRecord(failureValue);
    if (!failure) {
      continue;
    }

    const title = stringValue(failure.title) ?? "Generated product check failed";
    const testId = stringValue(failure.testId) ?? slugId(title);
    const request = asRecord(failure.request);
    const method = stringValue(request?.method);
    const url = stringValue(request?.url);
    const sourcePath = stringValue(failure.testSourcePath);
    const expected = stringValue(failure.expected) ?? "Generated product check should pass.";
    const actual = stringValue(failure.actual) ?? stringValue(failure.error) ?? "Generated product check failed.";
    const rerunCommand =
      stringValue(failure.rerunCommand) ??
      `npx codedecay product --target ${targetId} ${checkKind === "api" ? "--run-generated-api-tests" : "--run-generated-tests"} --test-id ${testId} --format markdown`;
    const classification = classifyGeneratedProductFailure(failure, checkKind);

    const artifacts: ProductFailureArtifact[] = [];
    if (sourcePath) {
      artifacts.push({
        kind: "test-source",
        path: sourcePath,
        label: "generated test source"
      });
    }

    if (method && url) {
      artifacts.push({
        kind: "request-response-diff",
        label: `${method} ${url}`,
        description: actual
      });
    }

    bundles.push({
      schemaVersion: 1,
      id: slugId(`${targetId}-${checkKind}-${testId}`),
      checkId: testId,
      checkKind,
      priority: "high",
      target: targetBaseUrl ? { id: targetId, baseUrl: targetBaseUrl } : { id: targetId },
      title,
      summary: stringValue(failure.error) ?? actual,
      classification: classification.classification,
      classificationConfidence: classification.confidence,
      classificationEvidence: classification.evidence,
      failedStep: {
        index: 1,
        label: stringValue(failure.failingStep) ?? `Run generated ${checkKind} check ${testId}.`,
        status: "failed",
        expected,
        actual
      },
      neighboringSteps: [],
      artifacts,
      expected,
      actual,
      impactedFiles: stringArray(failure.impactedFiles),
      suggestedFixTasks: productFailureSuggestedFixTasks(classification.classification, checkKind),
      rerunCommand
    });
  }

  return bundles;
}

function productFailureBundleFromTargetStatus(target: Record<string, unknown>): ProductFailureBundle | undefined {
  const status = stringValue(target.status);
  if (!status || !["failed", "blocked", "timed_out"].includes(status)) {
    return undefined;
  }

  const targetId = stringValue(target.id) ?? "product";
  const targetBaseUrl = stringValue(target.baseUrl);
  const reason = productTargetFailureReason(target) ?? `Product target ended with status ${status}.`;
  const classification = classifyProductWorkflowFailure(target, status, reason);

  return {
    schemaVersion: 1,
    id: slugId(`${targetId}-workflow-${status}`),
    checkId: `${targetId}.workflow.${status}`,
    checkKind: "workflow",
    priority: status === "failed" ? "high" : "medium",
    target: targetBaseUrl ? { id: targetId, baseUrl: targetBaseUrl } : { id: targetId },
    title: `Product target ${targetId} ${status.replace("_", " ")}`,
    summary: reason,
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    classificationEvidence: classification.evidence,
    failedStep: {
      index: 1,
      label: "Run product target workflow.",
      status: "failed",
      expected: "Product target workflow completes without failures.",
      actual: reason
    },
    neighboringSteps: [],
    artifacts: [],
    expected: "Product target workflow completes without failures.",
    actual: reason,
    impactedFiles: [],
    suggestedFixTasks: productFailureSuggestedFixTasks(classification.classification, "workflow"),
    rerunCommand: `npx codedecay product --target ${targetId} --format markdown`
  };
}

function classifyGeneratedProductFailure(
  failure: Record<string, unknown>,
  checkKind: ProductCheckKind
): {
  classification: ProductFailureClassification;
  confidence: number;
  evidence: string[];
} {
  const explicitClassification = productFailureClassificationValue(failure.classification);
  const explicitConfidence = numberValue(failure.classificationConfidence);
  const explicitEvidence = stringArray(failure.classificationEvidence);
  if (explicitClassification) {
    return {
      classification: explicitClassification,
      confidence: explicitConfidence ?? 0.7,
      evidence: explicitEvidence.length > 0 ? explicitEvidence : ["Classification was provided by the product report."]
    };
  }

  const retryEvidence = asRecord(failure.retryEvidence);
  const text = [
    stringValue(failure.title),
    stringValue(failure.failingStep),
    stringValue(failure.error),
    stringValue(failure.actual),
    stringValue(failure.expected)
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (stringValue(retryEvidence?.conclusion) === "passed-on-rerun") {
    return {
      classification: "likely-flaky",
      confidence: 0.85,
      evidence: ["The generated check failed initially and passed on a targeted rerun."]
    };
  }

  if (looksLikeEnvironmentFailure(text)) {
    return {
      classification: "environment-failure",
      confidence: 0.75,
      evidence: ["Failure text points to local runner, browser, server, network, or health-check setup."]
    };
  }

  if (looksLikeAuthOrTestDataFailure(text)) {
    return {
      classification: "auth-or-test-data-failure",
      confidence: 0.75,
      evidence: ["Failure text points to authentication, authorization, session, fixture, or seeded test-data setup."]
    };
  }

  if (checkKind === "ui" && looksLikeGeneratedTestWeakness(text)) {
    return {
      classification: "generated-test-weakness",
      confidence: 0.72,
      evidence: ["Failure text points to locator drift, visibility timing, strict-mode locator issues, or brittle generated-test timing."]
    };
  }

  if (stringValue(retryEvidence?.conclusion) === "failed-on-rerun") {
    return {
      classification: "confirmed-regression",
      confidence: 0.78,
      evidence: ["The generated check failed on the initial run and failed again on a targeted rerun."]
    };
  }

  if (checkKind === "api" && looksLikeApiRegression(text)) {
    return {
      classification: "confirmed-regression",
      confidence: 0.72,
      evidence: ["API response evidence points to a server error, undocumented status, or response contract drift."]
    };
  }

  return {
    classification: "unknown",
    confidence: 0.5,
    evidence: ["No deterministic classification rule matched this generated failure."]
  };
}

function classifyProductWorkflowFailure(
  target: Record<string, unknown>,
  status: string,
  reason: string
): {
  classification: ProductFailureClassification;
  confidence: number;
  evidence: string[];
} {
  const setup = asRecord(target.setup);
  const start = asRecord(target.start);
  const health = asRecord(target.health);
  const readiness = asRecord(target.readiness);
  const text = [reason, stringValue(readiness?.status), stringValue(readiness?.mode)].filter(Boolean).join("\n").toLowerCase();

  if (setup && isFailureStatus(stringValue(setup.status))) {
    return {
      classification: "auth-or-test-data-failure",
      confidence: 0.78,
      evidence: ["The target auth/setup command failed before generated product checks could run."]
    };
  }

  if (
    status === "blocked" ||
    status === "timed_out" ||
    (start && isFailureStatus(stringValue(start.status))) ||
    (health && isFailureStatus(stringValue(health.status))) ||
    looksLikeEnvironmentFailure(text)
  ) {
    return {
      classification: "environment-failure",
      confidence: 0.78,
      evidence: ["The product target failed during startup, preview URL resolution, health checking, or local execution setup."]
    };
  }

  if (looksLikeAuthOrTestDataFailure(text)) {
    return {
      classification: "auth-or-test-data-failure",
      confidence: 0.7,
      evidence: ["Workflow failure text points to auth/session/test-data setup rather than product behavior."]
    };
  }

  return {
    classification: "unknown",
    confidence: 0.45,
    evidence: ["The product target failed before generated check evidence was available."]
  };
}

function productFailureSuggestedFixTasks(
  classification: ProductFailureClassification,
  checkKind: ProductCheckKind
): string[] {
  const common = [
    "Treat auto-healing as review-only: do not update expected behavior unless a human confirms the product requirement changed."
  ];

  if (classification === "likely-flaky") {
    return dedupeStrings([
      ...common,
      "Re-run the targeted check and inspect timing, async state, network waits, and test isolation before changing product code.",
      "If behavior is correct, propose a reviewed wait/assertion stabilization patch for the generated test."
    ]);
  }

  if (classification === "environment-failure") {
    return dedupeStrings([
      ...common,
      "Fix preview URL, local startup, browser/Playwright install, network, or health-check setup before treating this as product behavior."
    ]);
  }

  if (classification === "auth-or-test-data-failure") {
    return dedupeStrings([
      ...common,
      "Add or repair auth setup, seeded fixtures, test accounts, permissions, or data reset before changing assertions."
    ]);
  }

  if (classification === "generated-test-weakness") {
    return dedupeStrings([
      ...common,
      "Suggest a reviewed generated-test patch using a stronger role/label/test-id locator, stable assertion, or explicit wait.",
      "Verify the product behavior manually or with an independent check before accepting any selector-only repair."
    ]);
  }

  if (classification === "confirmed-regression") {
    return dedupeStrings([
      ...common,
      checkKind === "api"
        ? "Inspect the failing API route, request data, auth setup, and response contract; fix product behavior before changing the generated test."
        : "Inspect the failing UI flow and product behavior; fix the product regression before changing the generated test."
    ]);
  }

  return dedupeStrings([
    ...common,
    checkKind === "api"
      ? "Inspect the failing API route, request data, auth setup, and response contract."
      : "Inspect the failing UI flow, locator stability, and product behavior."
  ]);
}

function looksLikeEnvironmentFailure(text: string): boolean {
  return /\b(econnrefused|enotfound|etimedout|network|dns|port|server was not ready|health|base url|preview url|start command|playwright is not installed|browser executable|cannot find module|timed out waiting for)\b/i.test(
    text
  );
}

function looksLikeAuthOrTestDataFailure(text: string): boolean {
  return /\b(401|403|unauthorized|forbidden|auth|login|session|token|cookie|permission|rbac|fixture|seed|test data|test account|not found.*user|missing user)\b/i.test(
    text
  );
}

function looksLikeGeneratedTestWeakness(text: string): boolean {
  return /\b(locator|strict mode violation|getbyrole|getbylabel|getbytext|selector|element is not visible|element not found|detached from dom|waiting for locator|to be visible|timeout.*locator|click intercepted)\b/i.test(
    text
  );
}

function looksLikeApiRegression(text: string): boolean {
  return /\b(5\d\d|500|502|503|504|server error|documented status|undocumented status|expected .* got|response contract|schema|invalid json)\b/i.test(
    text
  );
}

function isFailureStatus(status: string | undefined): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out" || status === "error";
}

function productFailureClassificationValue(value: unknown): ProductFailureClassification | undefined {
  return [
    "confirmed-regression",
    "likely-flaky",
    "environment-failure",
    "auth-or-test-data-failure",
    "generated-test-weakness",
    "unknown"
  ].includes(String(value))
    ? (value as ProductFailureClassification)
    : undefined;
}

function productTargetFailureReason(target: Record<string, unknown>): string | undefined {
  for (const key of ["setup", "start", "health", "exploration", "generatedTests", "generatedApiTests", "teardown"]) {
    const value = asRecord(target[key]);
    const error = stringValue(value?.error) ?? stringValue(value?.stderr) ?? stringValue(value?.blockedReason);
    if (error) {
      return error;
    }
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function slugId(value: string): string {
  let slug = "";
  let pendingSeparator = false;

  for (const char of value.toLowerCase()) {
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) {
      if (pendingSeparator && slug.length > 0 && slug.length < 96) {
        slug += "-";
      }
      pendingSeparator = false;
      if (slug.length < 96) {
        slug += char;
      }
      continue;
    }

    pendingSeparator = slug.length > 0;
  }

  while (slug.endsWith("-")) {
    slug = slug.slice(0, -1);
  }

  return slug || "product-failure";
}

function mergeImpactedRoutes(routes: ImpactedRoute[]): ImpactedRoute[] {
  const merged = new Map<string, ImpactedRoute>();

  for (const route of routes) {
    const key = `${route.framework}:${route.kind}:${route.route}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...route,
        methods: dedupeStrings(route.methods),
        files: dedupeStrings(route.files),
        reasons: dedupeStrings(route.reasons),
        recommendedTests: dedupeStrings(route.recommendedTests)
      });
      continue;
    }

    existing.methods = dedupeStrings([...existing.methods, ...route.methods]);
    existing.files = dedupeStrings([...existing.files, ...route.files]);
    existing.reasons = dedupeStrings([...existing.reasons, ...route.reasons]);
    existing.recommendedTests = dedupeStrings([...existing.recommendedTests, ...route.recommendedTests]);
    if (compareRiskLevels(route.risk, existing.risk) > 0) {
      existing.risk = route.risk;
    }
  }

  return [...merged.values()].sort((left, right) => {
    const risk = compareRiskLevels(right.risk, left.risk);
    if (risk !== 0) {
      return risk;
    }

    return `${left.framework}:${left.route}`.localeCompare(`${right.framework}:${right.route}`);
  });
}

function mergeImpactedAreas(areas: ImpactedArea[]): ImpactedArea[] {
  const merged = new Map<string, ImpactedArea>();

  for (const area of areas) {
    const key = `${area.kind}:${area.name}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...area,
        files: dedupeStrings(area.files)
      });
      continue;
    }

    existing.files = dedupeStrings([...existing.files, ...area.files]);
    if (compareRiskLevels(area.risk, existing.risk) > 0) {
      existing.risk = area.risk;
    }
  }

  return [...merged.values()].sort((left, right) => {
    const risk = compareRiskLevels(right.risk, left.risk);
    if (risk !== 0) {
      return risk;
    }

    return left.name.localeCompare(right.name);
  });
}
