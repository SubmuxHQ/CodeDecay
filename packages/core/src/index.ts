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

function sortProductFailureBundles(bundles: ProductFailureBundle[]): ProductFailureBundle[] {
  return [...bundles]
    .map((bundle) => ({
      ...bundle,
      neighboringSteps: [...bundle.neighboringSteps].sort((left, right) => left.index - right.index),
      artifacts: [...bundle.artifacts].sort((left, right) =>
        `${left.kind}:${left.path ?? ""}:${left.label ?? ""}`.localeCompare(`${right.kind}:${right.path ?? ""}:${right.label ?? ""}`)
      ),
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
