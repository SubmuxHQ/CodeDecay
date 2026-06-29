import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import {
  createTestProofAudit,
  weakTestRuleIds as testAuditWeakTestRuleIds
} from "@submuxhq/codedecay-test-audit";
import { collectConfiguredChecks, collectToolAdapterPlans } from "./checks";
import { summarizeMemory, summarizeSkills } from "./context";
import { suggestEdgeCases } from "./edge-cases";
import { createFixTasks } from "./fix-tasks";
import { createRedteamSafetySummary } from "./safety";
import type {
  RedteamReport,
  RedteamReportInput
} from "./types";

export { renderRedteamMarkdown, renderRedteamReport } from "./render";

export type {
  RedteamCheckKind,
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamFormat,
  RedteamMemorySummary,
  RedteamMode,
  RedteamReport,
  RedteamReportInput,
  RedteamSafetySummary,
  RedteamSkillSummary,
  RedteamSummary,
  RedteamTaskSource,
  RedteamToolAdapterPlan
} from "./types";

export function createRedteamReport(input: RedteamReportInput): RedteamReport {
  const testAudit = createTestProofAudit(input.analysisReport);
  const weakTestFindings = testAudit.weakTestFindings;
  const edgeCases = suggestEdgeCases(input.analysisReport);
  const configuredChecks = collectConfiguredChecks(input.config);
  const toolAdapterPlans = collectToolAdapterPlans(input.config);
  const memory = summarizeMemory(input.memory, input.memorySource);
  const skills = summarizeSkills(input.skills);
  const fixTasks = createFixTasks({
    analysisReport: input.analysisReport,
    weakTestFindings,
    edgeCases,
    configuredChecks,
    toolAdapterPlans,
    memory: input.memory,
    skills
  });

  const report: RedteamReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode: "deterministic",
    summary: {
      mergeRiskScore: input.analysisReport.summary.mergeRiskScore,
      decayScore: input.analysisReport.summary.decayScore,
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
      productFailureBundles: input.analysisReport.productFailureBundles?.length ?? 0,
      skills: skills.length,
      fixTasks: fixTasks.length
    },
    analysis: input.analysisReport,
    testAudit,
    weakTestFindings,
    edgeCases,
    configuredChecks,
    toolAdapterPlans,
    memory,
    skills,
    fixTasks,
    safety: createRedteamSafetySummary()
  };

  if (input.analysisReport.base) {
    report.base = input.analysisReport.base;
  }

  if (input.analysisReport.head) {
    report.head = input.analysisReport.head;
  }

  return report;
}

export function weakTestRuleIds(): string[] {
  return testAuditWeakTestRuleIds();
}
