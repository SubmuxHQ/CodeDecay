import { readFileSync } from "node:fs";
import { CODEDECAY_VERSION, type CodeDecayReport } from "@submuxhq/codedecay-core";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import type { ConfigFormat, TrendSnapshot, TrendSnapshotComparison } from "../types";

export function createTrendSnapshot(report: CodeDecayReport): TrendSnapshot {
  const audit = createTestProofAudit(report);
  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    base: report.base,
    head: report.head,
    summary: {
      mergeRiskScore: report.summary.mergeRiskScore,
      decayScore: report.summary.decayScore,
      riskLevel: report.summary.riskLevel,
      changedFiles: report.changedFiles.length,
      impactedAreas: report.impactedAreas.length,
      impactedRoutes: report.impactedRoutes?.length ?? 0,
      findingCounts: report.summary.findingCounts,
      missingTestFindings: audit.missingTestFindings.length,
      weakTestFindings: audit.weakTestFindings.length,
      evidenceMode: audit.evidenceMode,
      highRiskFiles: [
        ...new Set(report.findings.filter((finding) => finding.severity === "high" && finding.file).map((finding) => finding.file ?? ""))
      ].sort((left, right) => left.localeCompare(right)),
      impactedAreaKinds: [...new Set(report.impactedAreas.map((area) => area.kind))].sort((left, right) => left.localeCompare(right))
    }
  };
}

export function createTrendSnapshotComparison(current: TrendSnapshot, previous: TrendSnapshot): TrendSnapshotComparison {
  validateTrendSnapshot(current, "current");
  validateTrendSnapshot(previous, "previous");

  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    current,
    previous,
    delta: {
      mergeRiskScore: current.summary.mergeRiskScore - previous.summary.mergeRiskScore,
      decayScore: current.summary.decayScore - previous.summary.decayScore,
      changedFiles: current.summary.changedFiles - previous.summary.changedFiles,
      impactedAreas: current.summary.impactedAreas - previous.summary.impactedAreas,
      impactedRoutes: current.summary.impactedRoutes - previous.summary.impactedRoutes,
      highFindings: current.summary.findingCounts.high - previous.summary.findingCounts.high,
      mediumFindings: current.summary.findingCounts.medium - previous.summary.findingCounts.medium,
      lowFindings: current.summary.findingCounts.low - previous.summary.findingCounts.low,
      missingTestFindings: current.summary.missingTestFindings - previous.summary.missingTestFindings,
      weakTestFindings: current.summary.weakTestFindings - previous.summary.weakTestFindings
    }
  };
}

export function loadTrendSnapshot(path: string): TrendSnapshot {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as TrendSnapshot;
  try {
    validateTrendSnapshot(parsed, path);
  } catch {
    throw new Error(`Invalid CodeDecay snapshot: ${path}`);
  }

  return parsed;
}

function validateTrendSnapshot(snapshot: TrendSnapshot, label: string): void {
  if (!snapshot || typeof snapshot !== "object" || snapshot.tool !== "CodeDecay" || !snapshot.summary) {
    throw new Error(`Invalid CodeDecay snapshot: ${label}`);
  }

  const summary = snapshot.summary;
  for (const field of [
    "mergeRiskScore",
    "decayScore",
    "changedFiles",
    "impactedAreas",
    "impactedRoutes",
    "missingTestFindings",
    "weakTestFindings"
  ] as const) {
    if (!isFiniteNumber(summary[field])) {
      throw new Error(`Invalid CodeDecay snapshot: ${label}`);
    }
  }

  if (!summary.findingCounts || typeof summary.findingCounts !== "object") {
    throw new Error(`Invalid CodeDecay snapshot: ${label}`);
  }

  for (const level of ["low", "medium", "high"] as const) {
    if (!isFiniteNumber(summary.findingCounts[level])) {
      throw new Error(`Invalid CodeDecay snapshot: ${label}`);
    }
  }

  if (!["low", "medium", "high"].includes(summary.riskLevel)) {
    throw new Error(`Invalid CodeDecay snapshot: ${label}`);
  }

  if (!["heuristic_only", "runtime_augmented"].includes(summary.evidenceMode)) {
    throw new Error(`Invalid CodeDecay snapshot: ${label}`);
  }

  if (!Array.isArray(summary.highRiskFiles) || !Array.isArray(summary.impactedAreaKinds)) {
    throw new Error(`Invalid CodeDecay snapshot: ${label}`);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function renderTrendSnapshot(snapshot: TrendSnapshot, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(snapshot, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay Snapshot",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Merge risk | ${snapshot.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${snapshot.summary.decayScore}/100 |`,
    `| Risk level | ${snapshot.summary.riskLevel} |`,
    `| Changed files | ${snapshot.summary.changedFiles} |`,
    `| Impacted areas | ${snapshot.summary.impactedAreas} |`,
    `| Impacted routes/APIs | ${snapshot.summary.impactedRoutes} |`,
    `| Missing-test findings | ${snapshot.summary.missingTestFindings} |`,
    `| Weak-test findings | ${snapshot.summary.weakTestFindings} |`,
    `| Evidence mode | ${snapshot.summary.evidenceMode === "runtime_augmented" ? "runtime-augmented" : "heuristic-only"} |`,
    ""
  ];

  if (snapshot.summary.highRiskFiles.length > 0) {
    lines.push("High-risk files:");
    for (const file of snapshot.summary.highRiskFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  if (snapshot.summary.impactedAreaKinds.length > 0) {
    lines.push(`Impacted area kinds: ${snapshot.summary.impactedAreaKinds.join(", ")}`, "");
  }

  return `${lines.join("\n")}\n`;
}

export function renderTrendSnapshotComparison(comparison: TrendSnapshotComparison, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(comparison, null, 2)}\n`;
  }

  const lines = [
    "## CodeDecay Snapshot Comparison",
    "",
    "| Metric | Previous | Current | Delta |",
    "| --- | ---: | ---: | ---: |",
    `| Merge risk | ${comparison.previous.summary.mergeRiskScore} | ${comparison.current.summary.mergeRiskScore} | ${comparison.delta.mergeRiskScore} |`,
    `| Decay risk | ${comparison.previous.summary.decayScore} | ${comparison.current.summary.decayScore} | ${comparison.delta.decayScore} |`,
    `| Changed files | ${comparison.previous.summary.changedFiles} | ${comparison.current.summary.changedFiles} | ${comparison.delta.changedFiles} |`,
    `| Impacted areas | ${comparison.previous.summary.impactedAreas} | ${comparison.current.summary.impactedAreas} | ${comparison.delta.impactedAreas} |`,
    `| Impacted routes/APIs | ${comparison.previous.summary.impactedRoutes} | ${comparison.current.summary.impactedRoutes} | ${comparison.delta.impactedRoutes} |`,
    `| High findings | ${comparison.previous.summary.findingCounts.high} | ${comparison.current.summary.findingCounts.high} | ${comparison.delta.highFindings} |`,
    `| Weak-test findings | ${comparison.previous.summary.weakTestFindings} | ${comparison.current.summary.weakTestFindings} | ${comparison.delta.weakTestFindings} |`,
    ""
  ];

  const previousAreas = new Set(comparison.previous.summary.impactedAreaKinds);
  const currentAreas = new Set(comparison.current.summary.impactedAreaKinds);
  const addedAreas = [...currentAreas].filter((area) => !previousAreas.has(area)).sort((left, right) => left.localeCompare(right));
  const removedAreas = [...previousAreas].filter((area) => !currentAreas.has(area)).sort((left, right) => left.localeCompare(right));
  if (addedAreas.length > 0) {
    lines.push(`Added impacted areas: ${addedAreas.join(", ")}`);
  }
  if (removedAreas.length > 0) {
    lines.push(`Removed impacted areas: ${removedAreas.join(", ")}`);
  }
  if (addedAreas.length > 0 || removedAreas.length > 0) {
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
