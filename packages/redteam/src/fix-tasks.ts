import {
  isMemoryContextFinding,
  type ChangedPathTestProofEntry,
  type CodeDecayReport,
  type Finding,
  type ImpactedArea
} from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type {
  RedteamConfiguredCheck,
  RedteamEdgeCase,
  RedteamFixTask,
  RedteamFixTaskScope,
  RedteamPatternInsight,
  RedteamProofGrade,
  RedteamSkillSummary,
  RedteamToolAdapterPlan,
  RedteamVerificationSummary
} from "./types";
import { dedupeTasks, edgeCasePriority } from "./fix-tasks/helpers";
import { WEAK_TEST_RULES } from "./fix-tasks/rules";

export function createFixTasks(input: {
  analysisReport: CodeDecayReport;
  weakTestFindings: Finding[];
  edgeCases: RedteamEdgeCase[];
  configuredChecks: RedteamConfiguredCheck[];
  toolAdapterPlans: RedteamToolAdapterPlan[];
  patternInsights: RedteamPatternInsight[];
  verification?: RedteamVerificationSummary | undefined;
  memory: CodeDecayMemory;
  skills: RedteamSkillSummary[];
}): RedteamFixTask[] {
  const tasks: RedteamFixTask[] = [];
  const prioritizedFindings = input.analysisReport.findings
    .filter((finding) => finding.severity !== "low")
    .slice(0, 8);
  const findings = prioritizedFindings.length > 0 ? prioritizedFindings : input.analysisReport.findings.slice(0, 5);

  for (const finding of findings) {
    const memoryContext = isMemoryContextFinding(finding);
    tasks.push({
      title: `Investigate ${finding.title}`,
      priority: finding.severity,
      source: memoryContext ? "memory" : WEAK_TEST_RULES.has(finding.ruleId) ? "weak-test" : "finding",
      proof: proofForFinding(finding),
      detail: finding.description,
      file: finding.file,
      line: finding.line,
      scope: scopeForFinding(finding, input.analysisReport.impactedAreas)
    });
  }

  for (const entry of (input.analysisReport.testProofMap?.entries ?? [])
    .filter((item) => item.status !== "proven_by_runtime_coverage")
    .slice(0, 8)) {
    tasks.push({
      title: `Prove changed path: ${proofTargetLabel(entry)}`,
      priority: priorityForProofEntry(entry),
      source: "test-proof",
      proof: entry.status === "unproven" ? "missing-proof" : "deterministic-signal",
      detail: `${entry.reasons[0] ?? "Changed path lacks runtime-backed proof."} Repair: ${entry.repairTask}`,
      file: entry.file,
      line: entry.line,
      scope: scopeForFiles([entry.file, ...entry.routeFiles], input.analysisReport.impactedAreas)
    });
  }

  for (const recommendation of input.analysisReport.recommendedTests.slice(0, 20)) {
    tasks.push({
      title: proofRecommendationTitle(recommendation),
      priority: edgeCasePriority(input.analysisReport.impactedAreas),
      source: "test-proof",
      proof: "missing-proof",
      detail: normalizeProofRecommendation(recommendation),
      file: pathFromRecommendation(recommendation),
      scope: pathFromRecommendation(recommendation)
        ? scopeForFiles([pathFromRecommendation(recommendation) ?? ""], input.analysisReport.impactedAreas)
        : scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const edgeCase of input.edgeCases) {
    tasks.push({
      title: edgeCase.title,
      priority: edgeCasePriorityForScenario(edgeCase, input.analysisReport.impactedAreas),
      source: "edge-case",
      proof: "missing-proof",
      detail: `${edgeCase.trigger} Expected: ${edgeCase.expectedBehavior} Failure: ${edgeCase.userVisibleFailure} Proof: ${edgeCase.proof.recommendation}`,
      file: edgeCase.scope.files[0],
      scope: createScope(edgeCase.scope.files, edgeCase.scope.areas)
    });
  }

  for (const check of input.configuredChecks.slice(0, 8)) {
    tasks.push({
      title: `Consider running configured ${check.kind} check`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "configured-check",
      proof: "missing-proof",
      detail: `${check.name}: ${check.command}`,
      scope: scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const adapter of input.toolAdapterPlans.slice(0, 8)) {
    tasks.push({
      title: `Consider running ${adapter.name} harness`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "tool-adapter",
      proof: "missing-proof",
      detail: `${adapter.kind}: ${adapter.command}`,
      scope: scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const check of (input.verification?.checks ?? []).filter((check) => check.status !== "passed").slice(0, 8)) {
    tasks.push({
      title: verificationTaskTitle(check.status, check.name),
      priority: check.status === "skipped" ? "medium" : "high",
      source: check.kind === "test" || check.kind === "build" || check.kind === "start" || check.kind === "probe" || check.kind === "api-contract"
        ? "configured-check"
        : "tool-adapter",
      proof: check.proof,
      detail: verificationTaskDetail(check),
      scope: scopeForAreas(input.analysisReport.impactedAreas)
    });
  }

  for (const pattern of input.patternInsights.slice(0, 6)) {
    const detail = pattern.suggestedChecks[0] ?? pattern.edgeCases[0] ?? pattern.title;
    tasks.push({
      title: `Apply pattern: ${pattern.title}`,
      priority: pattern.areas.includes("auth") || pattern.areas.includes("api") ? "high" : "medium",
      source: "pattern",
      proof: "agent-suggestion",
      detail,
      scope: scopeForPattern(pattern, input.analysisReport.impactedAreas)
    });
  }

  for (const bundle of (input.analysisReport.productFailureBundles ?? []).slice(0, 8)) {
    tasks.push({
      title: `Fix product failure: ${bundle.title}`,
      priority: bundle.priority,
      source: "product-failure",
      proof: "tool-evidence",
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
      proof: "memory-context",
      detail: invariant.description
    });
  }

  for (const regression of input.memory.regressions.slice(0, 4)) {
    tasks.push({
      title: `Re-check past regression: ${regression.title}`,
      priority: regression.severity ?? "high",
      source: "memory",
      proof: "memory-context",
      detail: regression.check ? `${regression.description} Check: ${regression.check}` : regression.description
    });
  }

  for (const skill of input.skills.slice(0, 4)) {
    tasks.push({
      title: `Review with skill: ${skill.title}`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "memory",
      proof: "memory-context",
      detail: `${skill.summary} (${skill.path})`
    });
  }

  return selectBoundedTasks(dedupeTasks(tasks));
}

function selectBoundedTasks(tasks: RedteamFixTask[]): RedteamFixTask[] {
  const reservedScenarios = tasks
    .filter((task) => task.source === "edge-case" && task.priority === "high");
  const reserved = new Set(reservedScenarios);
  return dedupeTasks([
    ...reservedScenarios,
    ...tasks.filter((task) => !reserved.has(task))
  ].slice(0, 20));
}

function edgeCasePriorityForScenario(
  edgeCase: RedteamEdgeCase,
  impactedAreas: ImpactedArea[]
): RedteamFixTask["priority"] {
  const scopedAreas = impactedAreas.filter((area) => edgeCase.scope.areas.includes(area.kind));
  return edgeCasePriority(scopedAreas.length > 0 ? scopedAreas : impactedAreas);
}

function proofRecommendationTitle(recommendation: string): string {
  const path = pathFromRecommendation(recommendation);
  if (path) {
    return `Prove changed path: ${path}`;
  }
  const trimmed = recommendation.trim().replace(/[.!]$/, "");
  return `Complete recommended proof: ${trimmed.slice(0, 80)}`;
}

function normalizeProofRecommendation(recommendation: string): string {
  const trimmed = recommendation.trim();
  const path = pathFromRecommendation(trimmed);
  return path
    ? `Run or strengthen ${path} with assertions that exercise the changed production path.`
    : trimmed;
}

function pathFromRecommendation(recommendation: string): string | undefined {
  const directPath = recommendation.trim();
  if (/^[a-z0-9._/-]+\.[a-z0-9]+$/i.test(directPath) && /[/\\]/.test(directPath)) {
    return directPath;
  }
  return recommendation.match(/\b(?:src|app|lib|packages|test|tests)\/[a-z0-9._/-]+\.[a-z0-9]+\b/i)?.[0];
}

function proofTargetLabel(entry: ChangedPathTestProofEntry): string {
  return entry.symbol ? `${entry.file}#${entry.symbol}` : entry.file;
}

function priorityForProofEntry(entry: ChangedPathTestProofEntry): RedteamFixTask["priority"] {
  if (entry.status === "weakened_by_mocking" || entry.status === "unproven") {
    return "high";
  }

  return "medium";
}

function verificationTaskTitle(status: RedteamVerificationSummary["checks"][number]["status"], name: string): string {
  if (status === "skipped") {
    return `Run skipped proof check: ${name}`;
  }

  if (status === "blocked") {
    return `Resolve blocked proof check: ${name}`;
  }

  return `Fix failing proof check: ${name}`;
}

function verificationTaskDetail(check: RedteamVerificationSummary["checks"][number]): string {
  const parts = [`${check.summary} Command: ${check.command}`];
  if (check.rerunCommand) {
    parts.push(`Rerun: ${check.rerunCommand}`);
  }
  if (check.artifacts) {
    parts.push(`Artifacts: ${check.artifacts.directory}`);
  }
  return parts.join(" ");
}

function proofForFinding(finding: Finding): RedteamProofGrade {
  if (isMemoryContextFinding(finding)) {
    return "memory-context";
  }

  if (finding.category === "coverage" || finding.ruleId.includes("missing") || finding.ruleId.includes("weak")) {
    return "missing-proof";
  }

  return "deterministic-signal";
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
