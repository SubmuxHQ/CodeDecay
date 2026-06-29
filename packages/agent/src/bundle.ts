import type {
  RedteamConfiguredCheck,
  RedteamReport,
  RedteamToolAdapterPlan
} from "@submuxhq/codedecay-redteam";
import { formatRisk } from "./formatting";
import { getAgentProfile } from "./profiles";
import type { AgentProfile } from "./profiles";
import type {
  AgentEvidence,
  AgentFindingEvidence,
  AgentSuggestedCheck,
  AgentTaskBundle,
  AgentTaskSummary,
  CreateAgentTaskBundleOptions
} from "./types";

const DEFAULT_INSTRUCTIONS = [
  "Use this bundle as local tool evidence for a PR safety pass.",
  "Start from impacted routes/APIs when present, then broad impacted areas and weak-test findings.",
  "Do not assume the PR is safe just because tests pass.",
  "Add or improve tests that exercise real API, UI, database, or downstream behavior.",
  "Run only commands explicitly configured by the user or requested in the repo workflow.",
  "After making changes, re-run CodeDecay and the relevant project checks."
];

const DEFAULT_LIMITS = [
  "CodeDecay did not call an LLM/model to create this bundle.",
  "CodeDecay did not execute commands while creating this bundle.",
  "Agent suggestions are not trusted evidence unless verified by tests or tool output.",
  "This bundle reduces missed-review risk; it does not guarantee a safe merge."
];

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
  const evidence: AgentEvidence = {
    changedFiles: report.analysis.changedFiles.map((file) => ({
      path: file.path,
      status: file.status
    })),
    impactedAreas: report.analysis.impactedAreas.map((area) => ({
      kind: area.kind,
      name: area.name,
      risk: area.risk,
      files: [...area.files]
    })),
    impactedRoutes: (report.analysis.impactedRoutes ?? []).map((route) => ({
      framework: route.framework,
      kind: route.kind,
      route: route.route,
      methods: [...route.methods],
      risk: route.risk,
      files: [...route.files],
      reasons: [...route.reasons],
      recommendedTests: [...route.recommendedTests]
    })),
    weakTestFindings: report.weakTestFindings.map(findingEvidence),
    missingTestFindings: report.testAudit.missingTestFindings.map(findingEvidence),
    edgeCases: [...report.edgeCases],
    productFailureBundles: report.analysis.productFailureBundles ? [...report.analysis.productFailureBundles] : [],
    memory: report.memory
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
    evidence,
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

function createPortableAgentPrompt(summary: AgentTaskSummary, profile: AgentProfile): string {
  return [
    "You are helping fix a pull request using a CodeDecay agent task bundle.",
    "Treat the bundle as local tool evidence, not as a guarantee that the PR is safe.",
    `Target agent profile: ${profile.name}. ${profile.promptContext}`,
    `Current CodeDecay risk is ${formatRisk(summary.riskLevel)} with merge risk ${summary.mergeRiskScore}/100 and decay risk ${summary.decayScore}/100.`,
    `The bundle reports ${summary.changedFiles} changed files, ${summary.impactedAreas} impacted areas, ${summary.impactedRoutes} route/API impacts, ${summary.missingTestFindings} missing-test findings, ${summary.weakTestFindings} weak-test findings, ${summary.edgeCases} edge cases, ${summary.productFailureBundles} product failure bundles, and ${summary.fixTasks} fix tasks.`,
    "Your job:",
    "1. Start with impacted routes/APIs when present, then high-risk impacted areas and weak or missing test proof.",
    "2. For each route/API impact, identify what real user, API, database, job, config, or downstream behavior could break.",
    "3. Add or improve tests that exercise the real route/API or behavior path instead of only mocked or copied implementation logic.",
    "4. Cover the listed edge cases and any additional edge cases supported by the evidence.",
    "5. Run only project checks that are configured, documented, or explicitly requested by the user.",
    "6. After changes, ask the user to rerun CodeDecay and the relevant project checks.",
    "Do not treat your own answer as proof. Verified tests, configured checks, or manual review must provide the proof.",
    "CodeDecay did not call an LLM, execute commands, send telemetry, or depend on CodeDecayCloud to create this bundle."
  ].join("\n");
}

function collectSuggestedChecks(
  configuredChecks: RedteamConfiguredCheck[],
  toolAdapterPlans: RedteamToolAdapterPlan[]
): AgentSuggestedCheck[] {
  return [
    ...configuredChecks.map((check) => ({
      source: "configured-command" as const,
      name: check.name,
      kind: check.kind,
      command: check.command,
      willRun: false as const
    })),
    ...toolAdapterPlans.map((plan) => ({
      source: "tool-adapter" as const,
      name: plan.name,
      kind: plan.kind,
      command: plan.command,
      willRun: false as const
    }))
  ];
}

function findingEvidence(finding: RedteamReport["weakTestFindings"][number]): AgentFindingEvidence {
  const evidence: AgentFindingEvidence = {
    title: finding.title,
    severity: finding.severity,
    description: finding.description,
    ruleId: finding.ruleId
  };

  if (finding.file !== undefined) {
    evidence.file = finding.file;
  }

  if (finding.line !== undefined) {
    evidence.line = finding.line;
  }

  return evidence;
}
