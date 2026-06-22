export const CODEDECAY_VERSION = "0.1.1";

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
  recommendedTests: string[];
}

export interface ReportSummary {
  mergeRiskScore: number;
  decayScore: number;
  riskLevel: RiskLevel;
  findingCounts: Record<RiskLevel, number>;
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
  findings: Finding[];
  recommendedTests: string[];
}

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2
};

const FINDING_WEIGHTS: Record<RiskLevel, number> = {
  low: 6,
  medium: 16,
  high: 30
};

const DECAY_CATEGORIES = new Set<FindingCategory>(["decay", "scope"]);
const MERGE_RISK_CATEGORIES = new Set<FindingCategory>([
  "regression",
  "coverage",
  "configuration"
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
  generatedAt?: string | undefined;
}): CodeDecayReport {
  const findings = sortFindings(input.analyzerResult.findings);
  const mergeRiskScore = calculateScore(findings, MERGE_RISK_CATEGORIES, input.changedFiles);
  const decayScore = calculateScore(findings, DECAY_CATEGORIES, input.changedFiles);
  const riskLevel = riskLevelFromScore(Math.max(mergeRiskScore, decayScore));

  const report: CodeDecayReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      mergeRiskScore,
      decayScore,
      riskLevel,
      findingCounts: findingCounts(findings)
    },
    changedFiles: input.changedFiles,
    impactedAreas: mergeImpactedAreas(input.analyzerResult.impactedAreas),
    findings,
    recommendedTests: dedupeStrings(input.analyzerResult.recommendedTests)
  };

  if (input.base) {
    report.base = input.base;
  }

  if (input.head) {
    report.head = input.head;
  }

  return report;
}

function calculateScore(
  findings: Finding[],
  includedCategories: Set<FindingCategory>,
  changedFiles: FileChange[]
): number {
  const relevantFindings = findings.filter((finding) => includedCategories.has(finding.category));
  const findingScore = relevantFindings.reduce(
    (score, finding) => score + FINDING_WEIGHTS[finding.severity],
    0
  );

  const changeSizeScore = Math.min(
    18,
    Math.floor(changedFiles.reduce((sum, file) => sum + file.additions + file.deletions, 0) / 120) * 3
  );

  const fileSpreadScore = Math.min(12, Math.max(0, changedFiles.length - 5) * 2);

  return clampScore(findingScore + changeSizeScore + fileSpreadScore);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
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
