import type { RedteamReport } from "@submuxhq/codedecay-redteam";
import { collectSuggestedChecks } from "./bundle/checks";
import { DEFAULT_INSTRUCTIONS, DEFAULT_LIMITS } from "./bundle/defaults";
import { createAgentEvidence } from "./bundle/evidence";
import { createPortableAgentPrompt } from "./bundle/prompt";
import { getAgentProfile } from "./profiles";
import type {
  AgentTaskBundle,
  AgentTaskFilters,
  AgentTaskStatus,
  AgentTaskSummary,
  CreateAgentTaskBundleOptions
} from "./types";

export function createAgentTaskBundle(report: RedteamReport, options: CreateAgentTaskBundleOptions = {}): AgentTaskBundle {
  const agentProfile = getAgentProfile(options.profile ?? "generic");
  const evidence = createAgentEvidence(report);
  const tasks = filterTasks(report.fixTasks, options.taskFilters);
  const summary: AgentTaskSummary = {
    riskLevel: report.summary.riskLevel,
    mergeRiskScore: report.summary.mergeRiskScore,
    decayScore: report.summary.decayScore,
    securityScore: report.summary.securityScore,
    changedFiles: report.summary.changedFiles,
    impactedAreas: report.summary.impactedAreas,
    impactedRoutes: report.summary.impactedRoutes,
    missingTestFindings: report.summary.missingTestFindings,
    weakTestFindings: report.summary.weakTestFindings,
    testProofStatus: report.summary.testProofStatus,
    edgeCases: report.summary.edgeCases,
    productFailureBundles: report.summary.productFailureBundles,
    fixTasks: tasks.length,
    totalFixTasks: report.summary.fixTasks,
    scopeFindings: evidence.scopeFindings.length,
    contractFindings: evidence.contractFindings.length
  };

  return {
    tool: "CodeDecay",
    version: report.version,
    mode: "agent-task-bundle",
    status: determineStatus(report, tasks),
    generatedAt: report.generatedAt,
    purpose: agentProfile.description,
    agentProfile,
    summary,
    prompt: createPortableAgentPrompt(summary, agentProfile),
    instructions: [...DEFAULT_INSTRUCTIONS],
    evidence,
    tasks,
    taskFilters: options.taskFilters ?? {},
    suggestedChecks: collectSuggestedChecks(report.configuredChecks, report.toolAdapterPlans),
    skills: [...report.skills],
    safety: {
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      agentOutputTrusted: false
    },
    limits: [...DEFAULT_LIMITS]
  };
}

function filterTasks(tasks: RedteamReport["fixTasks"], filters: AgentTaskFilters | undefined): RedteamReport["fixTasks"] {
  if (!filters) {
    return [...tasks];
  }

  return tasks.filter((task) => {
    if (filters.source && task.source !== filters.source) {
      return false;
    }

    if (filters.priority && task.priority !== filters.priority) {
      return false;
    }

    if (filters.file && !(task.file === filters.file || task.file?.includes(filters.file))) {
      return false;
    }

    return true;
  });
}

function determineStatus(report: RedteamReport, tasks: RedteamReport["fixTasks"]): AgentTaskStatus {
  const hasConfirmedRegression = (report.analysis.productFailureBundles ?? []).some(
    (bundle) => bundle.classification === "confirmed-regression"
  );
  if (hasConfirmedRegression) {
    return "regressed";
  }

  return tasks.length > 0 ? "tasks-remaining" : "clean";
}
