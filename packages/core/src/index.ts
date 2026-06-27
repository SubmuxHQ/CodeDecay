export const CODEDECAY_VERSION = "0.3.0";

export type RiskLevel = "low" | "medium" | "high";

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

export type ScoreEvidenceKind = "direct" | "heuristic" | "structural";

export interface ScoreContributor {
  id: string;
  label: string;
  points: number;
  evidence: ScoreEvidenceKind;
  reason: string;
  category?: FindingCategory | undefined;
  severity?: RiskLevel | undefined;
  ruleId?: string | undefined;
  file?: string | undefined;
  line?: number | undefined;
}

export interface ScoreBreakdown {
  score: number;
  rawScore: number;
  adjustedScore: number;
  highestSeverity?: RiskLevel | undefined;
  heuristicOnly: boolean;
  contributors: ScoreContributor[];
  dampeners: ScoreContributor[];
  notes: string[];
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

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2
};

const DIRECT_FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 6,
  medium: 16,
  high: 30
};

const HEURISTIC_FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 4,
  medium: 10,
  high: 18
};

const DECAY_CATEGORIES = new Set<FindingCategory>(["decay", "scope"]);
const MERGE_RISK_CATEGORIES = new Set<FindingCategory>([
  "regression",
  "coverage",
  "configuration"
]);

const DIRECT_FINDING_RULE_IDS = new Set([
  "risky-auth-change",
  "risky-database-change",
  "risky-api-change",
  "risky-config-change",
  "memory-invariant-impacted",
  "memory-past-regression-area",
  "runtime-coverage-miss",
  "runtime-coverage-partial"
]);

const HEURISTIC_REGRESSION_RULE_IDS = new Set([
  "risky-ui-change",
  "risky-test-change",
  "risky-source-change",
  "risky-docs-change",
  "memory-architecture-note"
]);

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) {
    return "high";
  }

  if (score >= 40) {
    return "medium";
  }

  return "low";
}

export function shouldFailForRisk(actual: RiskLevel, threshold: RiskLevel): boolean {
  return RISK_ORDER[actual] >= RISK_ORDER[threshold];
}

export function compareRiskLevels(left: RiskLevel, right: RiskLevel): number {
  return RISK_ORDER[left] - RISK_ORDER[right];
}

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
  const mergeRiskBreakdown = calculateScoreBreakdown(findings, MERGE_RISK_CATEGORIES, input.changedFiles, "merge");
  const decayBreakdown = calculateScoreBreakdown(findings, DECAY_CATEGORIES, input.changedFiles, "decay");
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "product-failure";
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

function calculateScoreBreakdown(
  findings: Finding[],
  includedCategories: Set<FindingCategory>,
  changedFiles: FileChange[],
  scoreKind: "merge" | "decay"
): ScoreBreakdown {
  const relevantFindings = findings.filter((finding) => includedCategories.has(finding.category));
  const contributors = relevantFindings.map((finding) => createFindingContributor(finding));
  const directContributors = contributors.filter((contributor) => contributor.evidence === "direct");
  const heuristicOnly = relevantFindings.length > 0 && directContributors.length === 0;
  const structuralMultiplier = directContributors.length > 0 ? 1 : relevantFindings.length > 0 ? 0.5 : 0;
  const changeSizeScore = Math.round(
    Math.min(
      18,
      Math.floor(changedFiles.reduce((sum, file) => sum + file.additions + file.deletions, 0) / 120) * 3
    ) * structuralMultiplier
  );
  const fileSpreadScore = Math.round(Math.min(12, Math.max(0, changedFiles.length - 5) * 2) * structuralMultiplier);

  if (changeSizeScore > 0) {
    contributors.push({
      id: "change-size",
      label: "Change size",
      points: changeSizeScore,
      evidence: "structural",
      reason: `Changed lines amplify review cost across ${changedFiles.length} file(s).`
    });
  }

  if (fileSpreadScore > 0) {
    contributors.push({
      id: "file-spread",
      label: "File spread",
      points: fileSpreadScore,
      evidence: "structural",
      reason: `Change breadth spans ${changedFiles.length} file(s).`
    });
  }

  const runtimePersistenceScore = scoreKind === "merge" ? runtimePersistenceBoundaryScore(contributors) : 0;
  if (runtimePersistenceScore > 0) {
    contributors.push({
      id: "runtime-persistence-boundary",
      label: "Runtime config plus persistence boundary",
      points: runtimePersistenceScore,
      evidence: "structural",
      reason: "Runtime configuration and database/schema behavior changed together, which increases production regression risk."
    });
  }

  const rawScore = clampScore(contributors.reduce((score, contributor) => score + contributor.points, 0));
  const dampeners: ScoreContributor[] = [];
  let adjustedScore = rawScore;

  if (scoreKind === "merge" && heuristicOnly) {
    const dampenerPoints = Math.min(16, Math.max(4, Math.round(rawScore * 0.25)));
    dampeners.push({
      id: "heuristic-only-dampener",
      label: "Heuristic-only dampener",
      points: -dampenerPoints,
      evidence: "heuristic",
      reason: "Merge risk stays conservative until direct regression, configuration, or runtime coverage evidence exists."
    });
    adjustedScore = clampScore(adjustedScore - dampenerPoints);
  }

  let score = capScoreByHighestSeverity(adjustedScore, relevantFindings);
  const notes: string[] = [];
  if (scoreKind === "merge" && heuristicOnly) {
    score = Math.min(score, 54);
    notes.push("Heuristic-only merge risk is capped at 54/100 until direct regression, configuration, or runtime coverage evidence exists.");
  }

  if (changeSizeScore === 0 && fileSpreadScore === 0 && relevantFindings.length > 0) {
    notes.push("Blast-radius multipliers were suppressed because the current finding set is narrow or low-signal.");
  }

  return {
    score,
    rawScore,
    adjustedScore,
    highestSeverity: highestFindingSeverity(relevantFindings),
    heuristicOnly,
    contributors: sortScoreContributors(contributors),
    dampeners: sortScoreContributors(dampeners),
    notes
  };
}

function createFindingContributor(finding: Finding): ScoreContributor {
  const evidence = scoreEvidenceForFinding(finding);
  const points = (evidence === "direct" ? DIRECT_FINDING_WEIGHTS : HEURISTIC_FINDING_WEIGHTS)[finding.severity];
  return {
    id: `${finding.ruleId}:${finding.file ?? ""}:${finding.line ?? ""}`,
    label: finding.title,
    points,
    evidence,
    reason: finding.description,
    category: finding.category,
    severity: finding.severity,
    ruleId: finding.ruleId,
    file: finding.file,
    line: finding.line
  };
}

function runtimePersistenceBoundaryScore(contributors: ScoreContributor[]): number {
  const hasDatabaseChange = contributors.some((contributor) => contributor.ruleId === "risky-database-change");
  const hasConfigChange = contributors.some((contributor) => contributor.ruleId === "risky-config-change");
  const hasHighSeveritySignal = contributors.some((contributor) => contributor.severity === "high");

  return hasDatabaseChange && hasConfigChange && hasHighSeveritySignal ? 8 : 0;
}

function scoreEvidenceForFinding(finding: Finding): ScoreEvidenceKind {
  if ([...DIRECT_FINDING_RULE_IDS].some((ruleId) => finding.ruleId === ruleId || finding.ruleId.startsWith(`${ruleId}-`))) {
    return "direct";
  }

  if (finding.category === "configuration") {
    return "direct";
  }

  if (finding.category === "regression" && !HEURISTIC_REGRESSION_RULE_IDS.has(finding.ruleId)) {
    return "direct";
  }

  return "heuristic";
}

function sortScoreContributors(contributors: ScoreContributor[]): ScoreContributor[] {
  return [...contributors].sort((left, right) => {
    const points = Math.abs(right.points) - Math.abs(left.points);
    if (points !== 0) {
      return points;
    }

    return left.label.localeCompare(right.label);
  });
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function capScoreByHighestSeverity(score: number, findings: Finding[]): number {
  const highestSeverity = highestFindingSeverity(findings);
  if (highestSeverity === "low") {
    return Math.min(score, 39);
  }

  if (highestSeverity === "medium") {
    return Math.min(score, 69);
  }

  return score;
}

function highestFindingSeverity(findings: Finding[]): RiskLevel | undefined {
  let highest: RiskLevel | undefined;

  for (const finding of findings) {
    if (!highest || compareRiskLevels(finding.severity, highest) > 0) {
      highest = finding.severity;
    }
  }

  return highest;
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
