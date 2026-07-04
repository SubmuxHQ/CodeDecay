import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import { collectConfiguredChecks, collectToolAdapterPlans } from "./checks";
import { summarizeMemory, summarizeSkills } from "./context";
import { suggestEdgeCases } from "./edge-cases";
import { createFixTasks } from "./fix-tasks";
import { matchPatternIntelligence } from "./patterns";
import { createRedteamSafetySummary } from "./safety";
import type { RedteamReport, RedteamReportInput, RedteamVerificationSummary } from "./types";

export function createRedteamReport(input: RedteamReportInput): RedteamReport {
  const hasChangedFiles = input.analysisReport.changedFiles.length > 0;
  const testAudit = createTestProofAudit(input.analysisReport);
  const weakTestFindings = testAudit.weakTestFindings;
  const patternInsights = hasChangedFiles ? matchPatternIntelligence(input.analysisReport) : [];
  const edgeCases = hasChangedFiles
    ? mergeEdgeCases(suggestEdgeCases(input.analysisReport), patternInsights.flatMap((pattern) => pattern.edgeCases))
    : [];
  const configuredChecks = collectConfiguredChecks(input.config);
  const toolAdapterPlans = collectToolAdapterPlans(input.config);
  const memory = summarizeMemory(input.memory, input.memorySource, input.memoryProviderSources);
  const skills = summarizeSkills(input.skills);
  const verification = input.verification ?? createNotRunVerificationSummary();
  const fixTasks = hasChangedFiles
    ? createFixTasks({
        analysisReport: input.analysisReport,
        weakTestFindings,
        edgeCases,
        configuredChecks,
        toolAdapterPlans,
        patternInsights,
        verification,
        memory: input.memory,
        skills
      })
    : [];

  const report: RedteamReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode: "deterministic",
    summary: {
      mergeRiskScore: input.analysisReport.summary.mergeRiskScore,
      decayScore: input.analysisReport.summary.decayScore,
      securityScore: input.analysisReport.summary.securityScore,
      riskLevel: input.analysisReport.summary.riskLevel,
      changedFiles: input.analysisReport.changedFiles.length,
      impactedAreas: input.analysisReport.impactedAreas.length,
      impactedRoutes: input.analysisReport.impactedRoutes?.length ?? 0,
      findings: input.analysisReport.summary.findingCounts,
      missingTestFindings: testAudit.missingTestFindings.length,
      weakTestFindings: weakTestFindings.length,
      testProofStatus: testAudit.status,
      edgeCases: edgeCases.length,
      configuredChecks: configuredChecks.length,
      toolAdapters: toolAdapterPlans.length,
      patternInsights: patternInsights.length,
      productFailureBundles: input.analysisReport.productFailureBundles?.length ?? 0,
      verificationStatus: verification.status,
      skills: skills.length,
      fixTasks: fixTasks.length,
      investigationSuggestions: input.investigation?.suggestions.length ?? 0,
      investigationLimitations: input.investigation?.limitations.length ?? 0
    },
    analysis: input.analysisReport,
    testAudit,
    weakTestFindings,
    edgeCases,
    configuredChecks,
    toolAdapterPlans,
    patternInsights,
    memory,
    skills,
    investigation: input.investigation,
    verification,
    fixTasks,
    safety: createRedteamSafetySummary({
      commandsExecuted: verification.commandsExecuted,
      llmCalled: input.investigation?.llmCalled ?? false,
      memoryProvidersCalled: (input.memoryProviderSources ?? []).some((source) => source.kind === "external")
    })
  };

  if (input.analysisReport.base) {
    report.base = input.analysisReport.base;
  }

  if (input.analysisReport.head) {
    report.head = input.analysisReport.head;
  }

  return report;
}

function mergeEdgeCases(base: string[], patternEdgeCases: string[]): string[] {
  return [...new Set([...base, ...patternEdgeCases])].sort((left, right) => left.localeCompare(right));
}

function createNotRunVerificationSummary(): RedteamVerificationSummary {
  return {
    status: "not-run",
    commandsExecuted: false,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    timedOut: 0,
    errors: 0,
    durationMs: 0,
    checks: [],
    notes: ["Configured execution checks were not requested for this redteam report."]
  };
}
