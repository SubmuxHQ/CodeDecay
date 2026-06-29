import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { EvidenceSeverity } from "@submuxhq/codedecay-harness";
import type { SemgrepFinding, SemgrepReportAnalysis } from "./types";
import { normalizeArtifactPath } from "../shared/paths";
import { isPlainObject, optionalNumberValue, optionalStringValue } from "../shared/values";
import type { CodeDecayToolSeverity } from "../types";

export function analyzeSemgrepReport(
  cwd: string,
  reportPath: string | undefined,
  stdout: string
): SemgrepReportAnalysis | undefined {
  if (reportPath) {
    const absolutePath = isAbsolute(reportPath) ? reportPath : join(cwd, reportPath);
    if (existsSync(absolutePath)) {
      const artifactPath = normalizeArtifactPath(cwd, absolutePath);
      return parseSemgrepJson(readFileSync(absolutePath, "utf8"), cwd, artifactPath);
    }
  }

  if (!stdout.trim()) {
    return undefined;
  }

  return parseSemgrepJson(stdout, cwd, reportPath ? normalizeArtifactPath(cwd, reportPath) : undefined);
}

export function findingsAtOrAboveThreshold(
  findings: SemgrepFinding[],
  threshold: CodeDecayToolSeverity
): SemgrepFinding[] {
  return findings.filter((finding) => semgrepFindingSeverityLevel(finding.severity) >= codeDecayToolSeverityLevel(threshold));
}

export function highestSemgrepEvidenceSeverity(findings: SemgrepFinding[]): EvidenceSeverity {
  if (findings.some((finding) => finding.severity === "high")) {
    return "high";
  }

  if (findings.some((finding) => finding.severity === "medium")) {
    return "medium";
  }

  return "low";
}

export function semgrepFindingSummary(finding: SemgrepFinding): string {
  const rule = finding.checkId ? `${finding.checkId}: ` : "";
  const location = finding.path ? ` in ${finding.path}${finding.line ? `:${finding.line}` : ""}` : "";
  return `${rule}${finding.message}${location}.`;
}

export function compactSemgrepFindingMetadata(finding: SemgrepFinding): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    severity: finding.rawSeverity ?? finding.severity
  };

  if (finding.checkId) {
    metadata.checkId = finding.checkId;
  }

  if (finding.endLine !== undefined) {
    metadata.endLine = finding.endLine;
  }

  if (finding.fingerprint) {
    metadata.fingerprint = finding.fingerprint;
  }

  if (finding.metadata) {
    metadata.metadata = finding.metadata;
  }

  return metadata;
}

function parseSemgrepJson(raw: string, cwd: string, artifactPath: string | undefined): SemgrepReportAnalysis {
  try {
    const parsed = JSON.parse(raw);
    return summarizeSemgrepReport(parsed, cwd, artifactPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      artifactPath,
      findings: [],
      parseError: `Could not parse Semgrep JSON${artifactPath ? ` at ${artifactPath}` : ""}: ${message}`
    };
  }
}

function summarizeSemgrepReport(
  value: unknown,
  cwd: string,
  artifactPath: string | undefined
): SemgrepReportAnalysis {
  const results = isPlainObject(value) && Array.isArray(value.results) ? value.results : [];
  const findings = results
    .map((item) => normalizeSemgrepFinding(item, cwd))
    .filter((finding): finding is SemgrepFinding => Boolean(finding))
    .sort((left, right) => `${left.path ?? ""}:${left.line ?? 0}:${left.checkId ?? ""}`.localeCompare(`${right.path ?? ""}:${right.line ?? 0}:${right.checkId ?? ""}`));

  return {
    artifactPath,
    findings
  };
}

function normalizeSemgrepFinding(value: unknown, cwd: string): SemgrepFinding | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const extra = isPlainObject(value.extra) ? value.extra : {};
  const start = isPlainObject(value.start) ? value.start : {};
  const end = isPlainObject(value.end) ? value.end : {};
  const rawPath = optionalStringValue(value.path);
  const rawSeverity = optionalStringValue(extra.severity);
  const metadata = isPlainObject(extra.metadata) ? compactSemgrepMetadata(extra.metadata) : undefined;

  return {
    checkId: optionalStringValue(value.check_id),
    path: rawPath ? normalizeArtifactPath(cwd, rawPath) : undefined,
    line: optionalNumberValue(start.line),
    endLine: optionalNumberValue(end.line),
    message: optionalStringValue(extra.message) ?? optionalStringValue(value.message) ?? "Semgrep finding.",
    severity: semgrepSeverityToEvidenceSeverity(rawSeverity),
    rawSeverity,
    metadata,
    fingerprint: optionalStringValue(extra.fingerprint)
  };
}

function semgrepSeverityToEvidenceSeverity(value: string | undefined): EvidenceSeverity {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "ERROR") {
    return "high";
  }

  if (normalized === "WARNING") {
    return "medium";
  }

  if (normalized === "INFO") {
    return "low";
  }

  return "low";
}

function semgrepFindingSeverityLevel(severity: EvidenceSeverity): number {
  if (severity === "high") {
    return codeDecayToolSeverityLevel("high");
  }

  if (severity === "medium") {
    return codeDecayToolSeverityLevel("medium");
  }

  return codeDecayToolSeverityLevel("low");
}

function codeDecayToolSeverityLevel(severity: CodeDecayToolSeverity): number {
  if (severity === "high") {
    return 2;
  }

  if (severity === "medium") {
    return 1;
  }

  return 0;
}

function compactSemgrepMetadata(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const allowed = ["category", "confidence", "impact", "likelihood", "technology", "cwe", "owasp", "references"];
  const metadata: Record<string, unknown> = {};

  for (const key of allowed) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      metadata[key] = item;
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "string" || typeof entry === "number")) {
      metadata[key] = item.slice(0, 10);
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
