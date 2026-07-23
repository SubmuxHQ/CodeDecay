import {
  CODEDECAY_VERSION,
  createRequirementTrace,
  type RequirementTraceExternalEvidence
} from "@submuxhq/codedecay-core";
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
  const requirementTrace = input.requirements
    ? createRequirementTrace({
        requirements: input.requirements,
        report: input.analysisReport,
        externalEvidence: requirementEvidence(verification, configuredChecks, toolAdapterPlans),
        agentSuggestions: input.investigation?.suggestions,
        edgeCases,
        fixTasks
      })
    : undefined;
  const analysisReport = requirementTrace && input.requirements
    ? {
        ...input.analysisReport,
        requirements: input.requirements,
        requirementTrace
      }
    : input.analysisReport;

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
      symbolImpacts: input.analysisReport.symbolImpacts?.length ?? 0,
      findings: input.analysisReport.summary.findingCounts,
      missingTestFindings: testAudit.missingTestFindings.length,
      weakTestFindings: weakTestFindings.length,
      testProofEntries: testAudit.proofMap?.entries.length ?? 0,
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
    analysis: analysisReport,
    requirements: input.requirements,
    requirementTrace,
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

function requirementEvidence(
  verification: RedteamVerificationSummary,
  configuredChecks: RedteamReport["configuredChecks"],
  toolAdapterPlans: RedteamReport["toolAdapterPlans"]
): RequirementTraceExternalEvidence[] {
  const executed = verification.checks.map((check) => ({
    id: `verification:${check.kind}:${check.name}`,
    kind: requirementEvidenceKind(check.kind, check.differentialStatus),
    name: check.name,
    status: requirementEvidenceStatus(check.status),
    trusted: check.proof === "tool-evidence",
    summary: [check.summary, ...(check.differences ?? [])].join(" "),
    command: check.command
  } satisfies RequirementTraceExternalEvidence));
  if (verification.status !== "not-run") {
    return executed;
  }
  return [
    ...configuredChecks.map((check) => ({
      id: `configured:${check.kind}:${check.name}`,
      kind: "configured-check" as const,
      name: check.name,
      status: "missing" as const,
      trusted: true,
      summary: "Configured check is listed but was not executed.",
      command: check.command
    })),
    ...toolAdapterPlans.map((adapter) => ({
      id: `adapter:${adapter.kind}:${adapter.name}`,
      kind: requirementEvidenceKind(adapter.kind),
      name: adapter.name,
      status: "missing" as const,
      trusted: true,
      summary: "Configured tool adapter is listed but was not executed.",
      command: adapter.command
    }))
  ];
}

function requirementEvidenceKind(
  kind: RedteamVerificationSummary["checks"][number]["kind"],
  differentialStatus?: RedteamVerificationSummary["checks"][number]["differentialStatus"]
): RequirementTraceExternalEvidence["kind"] {
  if (differentialStatus || kind === "api-contract" || kind === "probe") {
    return "differential";
  }
  if (kind === "coverage") {
    return "coverage";
  }
  if (kind === "stryker") {
    return "mutation";
  }
  if (kind === "semgrep") {
    return "security";
  }
  return "configured-check";
}

function requirementEvidenceStatus(
  status: RedteamVerificationSummary["checks"][number]["status"]
): RequirementTraceExternalEvidence["status"] {
  if (status === "passed") {
    return "passed";
  }
  if (status === "failed" || status === "timed_out" || status === "error") {
    return "failed";
  }
  return "missing";
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
