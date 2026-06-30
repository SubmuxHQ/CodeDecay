import type { CodeDecayReport, Finding, ProductFailureBundle, ScoreContributor } from "@submuxhq/codedecay-core";
import { renderMarkdownReport } from "../markdown";
import { riskBadge } from "./helpers";

interface LeadSignal {
  rank: number;
  title: string;
  location?: string | undefined;
  detail: string;
  evidence: "direct" | "weak-test" | "missing-test" | "product-failure" | "conservative-score";
}

const HIGH_WEAK_TEST_RULE_IDS = new Set(["mocked-changed-source", "copied-implementation-in-test"]);
const MEDIUM_WEAK_TEST_RULE_IDS = new Set(["snapshot-only-test", "test-without-assertions"]);
const PRODUCT_FAILURE_CLASSIFICATIONS = new Set(["confirmed-regression", "likely-flaky"]);
const DIRECT_RULE_IDS = new Set([
  "risky-api-change",
  "risky-auth-change",
  "risky-config-change",
  "risky-database-change",
  "memory-invariant-impacted"
]);

export function renderPrCommentReport(report: CodeDecayReport): string {
  const lead = selectLeadSignal(report);
  const fullReport = renderMarkdownReport(report).trim();
  const lines = [
    "## CodeDecay PR Check",
    "",
    `**Lead catch:** ${lead.title}${lead.location ? ` — \`${lead.location}\`` : ""}`,
    "",
    lead.detail,
    "",
    `**Risk:** ${riskBadge(report.summary.riskLevel)} · Merge ${report.summary.mergeRiskScore}/100 · Decay ${report.summary.decayScore}/100 · Security ${report.summary.securityScore}/100`,
    ""
  ];

  if (lead.evidence === "conservative-score") {
    lines.push(
      "This score is conservative pending stronger direct evidence. Treat structural-only signals as review guidance, not proof of a regression.",
      ""
    );
  }

  lines.push(
    "<details>",
    "<summary>Full CodeDecay report</summary>",
    "",
    fullReport,
    "",
    "</details>",
    "",
    "---",
    "Found by [CodeDecay](https://github.com/SubmuxHQ/CodeDecay) - deterministic, local-first, no telemetry.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function selectLeadSignal(report: CodeDecayReport): LeadSignal {
  const candidates = [
    ...report.findings.map((finding) => leadFromFinding(finding, report)).filter(isLeadSignal),
    ...((report.productFailureBundles ?? []).map(leadFromProductFailure).filter(isLeadSignal))
  ];

  candidates.sort((left, right) => right.rank - left.rank || left.title.localeCompare(right.title));

  return candidates[0] ?? {
    rank: 0,
    title: "No direct high-signal catch found",
    detail: "CodeDecay did not find a strong direct regression or weak-test signal in this run.",
    evidence: "conservative-score"
  };
}

function leadFromFinding(finding: Finding, report: CodeDecayReport): LeadSignal | undefined {
  const location = formatLocation(finding.file, finding.line);

  if (HIGH_WEAK_TEST_RULE_IDS.has(finding.ruleId)) {
    return {
      rank: 100 + severityRank(finding.severity),
      title: finding.title,
      location,
      detail: finding.description,
      evidence: "weak-test"
    };
  }

  if (isDirectFinding(finding, report)) {
    return {
      rank: 90 + severityRank(finding.severity),
      title: finding.title,
      location,
      detail: finding.description,
      evidence: "direct"
    };
  }

  if (MEDIUM_WEAK_TEST_RULE_IDS.has(finding.ruleId)) {
    return {
      rank: 80 + severityRank(finding.severity),
      title: finding.title,
      location,
      detail: finding.description,
      evidence: "weak-test"
    };
  }

  if (finding.ruleId === "missing-nearby-tests") {
    return {
      rank: 70 + severityRank(finding.severity),
      title: finding.title,
      location,
      detail: finding.description,
      evidence: "missing-test"
    };
  }

  return undefined;
}

function leadFromProductFailure(bundle: ProductFailureBundle): LeadSignal | undefined {
  if (
    (bundle.classificationConfidence ?? 0) < 0.75 ||
    !PRODUCT_FAILURE_CLASSIFICATIONS.has(bundle.classification)
  ) {
    return undefined;
  }

  return {
    rank: 60 + severityRank(bundle.priority),
    title: bundle.title,
    detail: bundle.summary,
    evidence: "product-failure"
  };
}

function isDirectFinding(finding: Finding, report: CodeDecayReport): boolean {
  if (finding.ruleId === "risky-ui-change" && !hasWeakTestBacking(report)) {
    return false;
  }

  if (DIRECT_RULE_IDS.has(finding.ruleId)) {
    return true;
  }

  return collectContributors(report).some(
    (contributor) =>
      contributor.evidence === "direct" &&
      contributor.ruleId === finding.ruleId &&
      (!contributor.file || !finding.file || contributor.file === finding.file)
  );
}

function collectContributors(report: CodeDecayReport): ScoreContributor[] {
  return [
    ...(report.summary.mergeRiskBreakdown?.contributors ?? []),
    ...(report.summary.decayBreakdown?.contributors ?? []),
    ...(report.summary.securityBreakdown?.contributors ?? [])
  ];
}

function hasWeakTestBacking(report: CodeDecayReport): boolean {
  return report.findings.some((finding) =>
    HIGH_WEAK_TEST_RULE_IDS.has(finding.ruleId) ||
    MEDIUM_WEAK_TEST_RULE_IDS.has(finding.ruleId) ||
    finding.ruleId === "missing-nearby-tests"
  );
}

function severityRank(severity: Finding["severity"]): number {
  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

function formatLocation(file: string | undefined, line: number | undefined): string | undefined {
  if (!file) {
    return undefined;
  }

  return line ? `${file}:${line}` : file;
}

function isLeadSignal(value: LeadSignal | undefined): value is LeadSignal {
  return Boolean(value);
}
