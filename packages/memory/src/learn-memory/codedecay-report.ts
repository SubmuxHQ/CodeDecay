import type { ImpactedArea } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "../types";
import { isPlainObject, optionalString } from "../schema";
import { inferMemoryMatcher, normalizeAreaKind, normalizeRiskValue } from "./matchers";

export function appendLearnedCodeDecayReport(memory: CodeDecayMemory, report: Record<string, unknown>): void {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const recommendedTests = Array.isArray(report.recommendedTests)
    ? report.recommendedTests.filter((item): item is string => typeof item === "string")
    : [];
  const impactedAreas = Array.isArray(report.impactedAreas) ? report.impactedAreas : [];
  const reportAreas = impactedAreas
    .map((area) => (isPlainObject(area) && typeof area.kind === "string" ? normalizeAreaKind(area.kind) : undefined))
    .filter((area): area is ImpactedArea["kind"] => Boolean(area));

  for (const finding of findings) {
    if (!isPlainObject(finding)) {
      continue;
    }

    const severity = normalizeRiskValue(finding.severity);
    if (severity === "low") {
      continue;
    }

    const title =
      optionalString(finding.title, "CodeDecay report", "finding.title") ??
      optionalString(finding.ruleId, "CodeDecay report", "finding.ruleId") ??
      "CodeDecay finding";
    const description =
      optionalString(finding.description, "CodeDecay report", "finding.description") ??
      `CodeDecay finding ${title} was learned from a blocked or reviewed report.`;
    const file = optionalString(finding.file, "CodeDecay report", "finding.file");
    if (!isActionableLearnedCodeDecayFinding({ file, reportAreas, recommendedTests })) {
      continue;
    }

    const matcher = inferMemoryMatcher(
      {
        files: file ? [file] : undefined,
        areas: reportAreas.length > 0 ? reportAreas : undefined
      },
      `${title}\n${description}\n${file ?? ""}`
    );

    memory.regressions.push({
      title: `CodeDecay: ${title}`,
      description,
      check: recommendedTests[0] ?? `Re-check CodeDecay finding: ${title}`,
      severity,
      ...matcher
    });
  }
}

function isActionableLearnedCodeDecayFinding(input: {
  file: string | undefined;
  reportAreas: ImpactedArea["kind"][];
  recommendedTests: string[];
}): boolean {
  return Boolean(input.file) || input.reportAreas.length > 0 || input.recommendedTests.length > 0;
}
