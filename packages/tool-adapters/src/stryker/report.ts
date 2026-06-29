import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { StrykerMutationReportAnalysis, StrykerWeakMutant } from "./types";
import { normalizeArtifactPath } from "../shared/paths";
import { isPlainObject, optionalStringValue } from "../shared/values";

export function analyzeStrykerMutationReport(
  cwd: string,
  reportPath: string
): StrykerMutationReportAnalysis | undefined {
  const absolutePath = isAbsolute(reportPath) ? reportPath : join(cwd, reportPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const normalizedReportPath = normalizeArtifactPath(cwd, absolutePath);

  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
    return summarizeStrykerMutationReport(parsed, cwd, normalizedReportPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reportPath: normalizedReportPath,
      totalMutants: 0,
      survivedMutants: 0,
      noCoverageMutants: 0,
      weakMutants: [],
      parseError: `Could not parse StrykerJS mutation report at ${normalizedReportPath}: ${message}`
    };
  }
}

export function strykerReportFailureMessage(report: StrykerMutationReportAnalysis): string {
  return `StrykerJS found ${report.weakMutants.length} surviving or no-coverage mutant(s). Strengthen tests before merge.`;
}

export function compactStrykerReportMetadata(report: StrykerMutationReportAnalysis): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    reportPath: report.reportPath,
    totalMutants: report.totalMutants,
    survivedMutants: report.survivedMutants,
    noCoverageMutants: report.noCoverageMutants
  };

  if (report.mutationScore !== undefined) {
    metadata.mutationScore = report.mutationScore;
  }

  return metadata;
}

export function compactMutantMetadata(mutant: StrykerWeakMutant): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    status: mutant.status
  };

  if (mutant.id) {
    metadata.id = mutant.id;
  }

  if (mutant.mutatorName) {
    metadata.mutatorName = mutant.mutatorName;
  }

  if (mutant.replacement) {
    metadata.replacement = mutant.replacement;
  }

  if (mutant.statusReason) {
    metadata.statusReason = mutant.statusReason;
  }

  return metadata;
}

function summarizeStrykerMutationReport(
  value: unknown,
  cwd: string,
  reportPath: string
): StrykerMutationReportAnalysis {
  const files = isPlainObject(value) && isPlainObject(value.files) ? value.files : {};
  const weakMutants: StrykerWeakMutant[] = [];
  let totalMutants = 0;
  let survivedMutants = 0;
  let noCoverageMutants = 0;

  for (const [filePath, fileReport] of Object.entries(files)) {
    if (!isPlainObject(fileReport) || !Array.isArray(fileReport.mutants)) {
      continue;
    }

    const normalizedFile = normalizeArtifactPath(cwd, filePath);
    for (const mutant of fileReport.mutants) {
      if (!isPlainObject(mutant)) {
        continue;
      }

      totalMutants += 1;
      const status = normalizeStrykerMutantStatus(mutant.status);
      if (!status) {
        continue;
      }

      if (status === "Survived") {
        survivedMutants += 1;
      } else {
        noCoverageMutants += 1;
      }

      weakMutants.push({
        id: optionalStringValue(mutant.id),
        file: normalizedFile,
        line: readMutantStartLine(mutant.location),
        status,
        mutatorName: optionalStringValue(mutant.mutatorName),
        replacement: optionalStringValue(mutant.replacement),
        statusReason: optionalStringValue(mutant.statusReason)
      });
    }
  }

  return {
    reportPath,
    totalMutants,
    survivedMutants,
    noCoverageMutants,
    weakMutants: weakMutants.sort((left, right) => `${left.file}:${left.line ?? 0}`.localeCompare(`${right.file}:${right.line ?? 0}`)),
    mutationScore: readMutationScore(value)
  };
}

function normalizeStrykerMutantStatus(value: unknown): "Survived" | "NoCoverage" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "survived") {
    return "Survived";
  }

  if (normalized === "nocoverage") {
    return "NoCoverage";
  }

  return undefined;
}

function readMutantStartLine(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.start)) {
    return undefined;
  }

  return typeof value.start.line === "number" && Number.isFinite(value.start.line)
    ? value.start.line
    : undefined;
}

function readMutationScore(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.thresholds)) {
    return undefined;
  }

  const score = value.thresholds.mutationScore;
  return typeof score === "number" && Number.isFinite(score) ? score : undefined;
}
