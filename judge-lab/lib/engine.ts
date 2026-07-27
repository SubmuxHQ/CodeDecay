import { createAnalysisReport } from "../../packages/core/src/report";
import type { AnalyzerResult, FileChange, Finding } from "../../packages/core/src/types";
import { CODEDECAY_VERSION } from "../../packages/core/src/version";
import { scanSecurityCandidates } from "../../packages/matchers/src/index";
import type { JudgeFinding, JudgeLabResult, ReviewState, ScenarioId } from "./contracts";
import { precomputedWeakTest, SCENARIOS, scenarioMaterial } from "./scenarios";
import { sourceCommit, sourceLinks } from "./source";

export { CODEDECAY_VERSION };

export function runJudgeScenario(scenarioId: ScenarioId, state: ReviewState): JudgeLabResult {
  if (scenarioId === "weak-test") {
    return precomputedWeakTest(state);
  }

  const startedAt = performance.now();
  const material = scenarioMaterial(scenarioId, state);
  const change = createChange(material.file, material.after);
  const security = scanSecurityCandidates({
    files: [{ path: material.file, content: material.after }],
  });
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) {
    throw new Error("Unknown curated scenario");
  }

  const analyzerResult: AnalyzerResult = {
    findings: security.findings,
    impactedAreas:
      scenarioId === "auth-api"
        ? [
            { name: "users API", kind: "api", risk: "high", files: [material.file] },
            { name: "authentication", kind: "auth", risk: "high", files: [material.file] },
          ]
        : [{ name: "documentation", kind: "docs", risk: "low", files: [material.file] }],
    impactedRoutes:
      scenarioId === "auth-api"
        ? [
            {
              framework: "nextjs",
              kind: "api-route",
              route: material.route,
              methods: material.methods,
              files: [material.file],
              risk: state === "risky" ? "high" : "low",
              reasons: [material.userImpact],
              recommendedTests: material.verification,
            },
          ]
        : [],
    securityAnalysis: {
      scannedFiles: security.scannedFiles,
      candidateCount: security.candidates.length,
      skippedFiles: security.skippedFiles,
    },
    securityCandidates: security.candidates,
    recommendedTests: material.verification,
  };
  const report = createAnalysisReport({
    base: "base",
    head: state,
    changedFiles: [change],
    analyzerResult,
  });
  const commit = sourceCommit();
  const findings = report.findings.map(toJudgeFinding);
  const liveDuration = Math.max(1, Math.round(performance.now() - startedAt));

  return {
    scenarioId,
    scenarioTitle: scenario.title,
    scenarioKicker: scenario.kicker,
    state,
    execution: {
      mode: "live",
      label: "Executed now with the CodeDecay deterministic matcher and scoring engine",
      engineVersion: CODEDECAY_VERSION,
      sourceCommit: commit,
      generatedAt: report.generatedAt,
      durationMs: liveDuration,
      reproduction: `curl -sS -X POST <judge-lab>/api/run -H 'content-type: application/json' --data '{"scenarioId":"${scenarioId}","state":"${state}"}'`,
    },
    diff: { file: material.file, before: material.before, after: material.after },
    summary: {
      riskLevel: report.summary.riskLevel,
      mergeRiskScore: report.summary.mergeRiskScore,
      securityScore: report.summary.securityScore,
      recommendation:
        report.summary.riskLevel === "high"
          ? "Block merge until the exposed production path is repaired and verified."
          : "Low deterministic risk. Review normally; do not invent blockers.",
    },
    impactedRoute: {
      route: material.route,
      methods: material.methods,
      userImpact: material.userImpact,
    },
    testProof: material.testProof,
    findings,
    edgeCases: material.edgeCases,
    repairTasks: material.repairTasks,
    verification: material.verification,
    links: sourceLinks(commit),
  };
}

function createChange(path: string, content: string): FileChange {
  const lines = content.split("\n");
  return {
    path,
    status: "modified",
    additions: lines.length,
    deletions: 1,
    addedLines: lines.map((line, index) => ({ line: index + 1, content: line })),
  };
}

function toJudgeFinding(finding: Finding): JudgeFinding {
  return {
    ruleId: finding.ruleId,
    title: finding.title,
    detail: finding.description,
    severity: finding.severity,
    evidenceKind: "deterministic",
    ...(finding.file ? { file: finding.file } : {}),
    ...(finding.line ? { line: finding.line } : {}),
  };
}
