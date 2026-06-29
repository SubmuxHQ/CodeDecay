import type { RedteamReport } from "@submuxhq/codedecay-redteam";
import { collectSuggestedChecks } from "./bundle/checks";
import { DEFAULT_INSTRUCTIONS, DEFAULT_LIMITS } from "./bundle/defaults";
import { createAgentEvidence } from "./bundle/evidence";
import { createPortableAgentPrompt } from "./bundle/prompt";
import { getAgentProfile } from "./profiles";
import type {
  AgentTaskBundle,
  AgentTaskSummary,
  CreateAgentTaskBundleOptions
} from "./types";

export function createAgentTaskBundle(report: RedteamReport, options: CreateAgentTaskBundleOptions = {}): AgentTaskBundle {
  const agentProfile = getAgentProfile(options.profile ?? "generic");
  const summary: AgentTaskSummary = {
    riskLevel: report.summary.riskLevel,
    mergeRiskScore: report.summary.mergeRiskScore,
    decayScore: report.summary.decayScore,
    changedFiles: report.summary.changedFiles,
    impactedAreas: report.summary.impactedAreas,
    impactedRoutes: report.summary.impactedRoutes,
    missingTestFindings: report.summary.missingTestFindings,
    weakTestFindings: report.summary.weakTestFindings,
    testProofStatus: report.summary.testProofStatus,
    edgeCases: report.summary.edgeCases,
    productFailureBundles: report.summary.productFailureBundles,
    fixTasks: report.summary.fixTasks
  };

  return {
    tool: "CodeDecay",
    version: report.version,
    mode: "agent-task-bundle",
    generatedAt: report.generatedAt,
    purpose: agentProfile.description,
    agentProfile,
    summary,
    prompt: createPortableAgentPrompt(summary, agentProfile),
    instructions: [...DEFAULT_INSTRUCTIONS],
    evidence: createAgentEvidence(report),
    tasks: [...report.fixTasks],
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
