import type { CodeDecayReport, Finding, ImpactedArea } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamFixTaskScope,
  RedteamPatternInsight,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "./types";
import { dedupeTasks, edgeCasePriority, edgeCaseTaskTitle } from "./fix-tasks/helpers";
import { WEAK_TEST_RULES } from "./fix-tasks/rules";

export function createFixTasks(input: {
  analysisReport: CodeDecayReport;
  weakTestFindings: Finding[];
  edgeCases: string[];
  configuredChecks: RedteamConfiguredCheck[];
  toolAdapterPlans: RedteamToolAdapterPlan[];
  patternInsights: RedteamPatternInsight[];
  memory: CodeDecayMemory;
  skills: RedteamSkillSummary[];
}): RedteamFixTask[] {
  const tasks: RedteamFixTask[] = [];
  const prioritizedFindings = input.analysisReport.findings
    .filter((finding) => finding.severity !== "low")
    .slice(0, 8);
  const findings = prioritizedFindings.length > 0 ? prioritizedFindings : input.analysisReport.findings.slice(0, 5);

  for (const finding of findings) {
    tasks.push({
      title: `Investigate ${finding.title}`,
      priority: finding.severity,
      source: WEAK_TEST_RULES.has(finding.ruleId) ? "weak-test" : "finding",
      detail: finding.description,
      file: finding.file,
      line: finding.line,
      scope: scopeForFinding(finding, input.analysisReport.impactedAreas)
    });
  }

  for (const edgeCase of input.edgeCases.slice(0, 8)) {
    tasks.push({
      title: edgeCaseTaskTitle(edgeCase),
      priority: edgeCasePriority(input.analysisReport.impactedAreas),
      source: "edge-case",
      detail: edgeCase,
      scope: scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const check of input.configuredChecks.slice(0, 8)) {
    tasks.push({
      title: `Consider running configured ${check.kind} check`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "configured-check",
      detail: `${check.name}: ${check.command}`,
      scope: scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const adapter of input.toolAdapterPlans.slice(0, 8)) {
    tasks.push({
      title: `Consider running ${adapter.name} harness`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "tool-adapter",
      detail: `${adapter.kind}: ${adapter.command}`,
      scope: scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const pattern of input.patternInsights.slice(0, 6)) {
    const detail = pattern.suggestedChecks[0] ?? pattern.edgeCases[0] ?? pattern.title;
    tasks.push({
      title: `Apply pattern: ${pattern.title}`,
      priority: pattern.areas.includes("auth") || pattern.areas.includes("api") ? "high" : "medium",
      source: "pattern",
      detail,
      scope: scopeForPattern(pattern, input.analysisReport.impactedAreas)
    });
  }

  for (const bundle of (input.analysisReport.productFailureBundles ?? []).slice(0, 8)) {
    tasks.push({
      title: `Fix product failure: ${bundle.title}`,
      priority: bundle.priority,
      source: "product-failure",
      detail: `${bundle.summary} Rerun: ${bundle.rerunCommand}`,
      file: bundle.impactedFiles[0],
      scope: scopeForFiles(bundle.impactedFiles, input.analysisReport.impactedAreas)
    });
  }

  for (const invariant of input.memory.invariants.slice(0, 4)) {
    tasks.push({
      title: `Verify invariant: ${invariant.name}`,
      priority: invariant.severity ?? "medium",
      source: "memory",
      detail: invariant.description
    });
  }

  for (const regression of input.memory.regressions.slice(0, 4)) {
    tasks.push({
      title: `Re-check past regression: ${regression.title}`,
      priority: regression.severity ?? "high",
      source: "memory",
      detail: regression.check ? `${regression.description} Check: ${regression.check}` : regression.description
    });
  }

  for (const skill of input.skills.slice(0, 4)) {
    tasks.push({
      title: `Review with skill: ${skill.title}`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "memory",
      detail: `${skill.summary} (${skill.path})`
    });
  }

  return dedupeTasks(tasks).slice(0, 20);
}

function scopeForFinding(finding: Finding, impactedAreas: ImpactedArea[]): RedteamFixTaskScope | undefined {
  return finding.file ? scopeForFiles([finding.file], impactedAreas) : scopeForAreas(impactedAreas);
}

function scopeForPattern(pattern: RedteamPatternInsight, impactedAreas: ImpactedArea[]): RedteamFixTaskScope | undefined {
  const areas = impactedAreas.filter((area) => pattern.areas.includes(area.kind));
  return scopeForAreas(areas.length > 0 ? areas : impactedAreas);
}

function scopeForFiles(files: string[], impactedAreas: ImpactedArea[]): RedteamFixTaskScope | undefined {
  const normalizedFiles = [...new Set(files.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const areas = impactedAreas
    .filter((area) => area.files.some((file) => normalizedFiles.includes(file)))
    .map((area) => area.kind);
  return createScope(normalizedFiles, areas);
}

function scopeForAreas(impactedAreas: ImpactedArea[]): RedteamFixTaskScope | undefined {
  const files = impactedAreas.flatMap((area) => area.files);
  const areas = impactedAreas.map((area) => area.kind);
  return createScope(files, areas);
}

function createScope(files: string[], areas: ImpactedArea["kind"][]): RedteamFixTaskScope | undefined {
  const uniqueFiles = [...new Set(files)].sort((left, right) => left.localeCompare(right));
  const uniqueAreas = [...new Set(areas)].sort((left, right) => left.localeCompare(right));
  if (uniqueFiles.length === 0 && uniqueAreas.length === 0) {
    return undefined;
  }

  return {
    files: uniqueFiles,
    areas: uniqueAreas
  };
}
