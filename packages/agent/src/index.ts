import type { RiskLevel } from "@submuxhq/codedecay-core";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamReport,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "@submuxhq/codedecay-redteam";
import { getAgentProfile } from "./profiles";
import type { AgentProfile } from "./profiles";
import type {
  AgentEvidence,
  AgentFindingEvidence,
  AgentImpactedRoute,
  AgentSuggestedCheck,
  AgentTaskBundle,
  AgentTaskBundleFormat,
  AgentTaskSummary,
  CreateAgentTaskBundleOptions
} from "./types";

export {
  AGENT_PROFILE_IDS,
  getAgentProfile,
  isAgentProfileId,
  listAgentProfiles,
  type AgentProfile,
  type AgentProfileId
} from "./profiles";
export type {
  AgentChangedFile,
  AgentEvidence,
  AgentFindingEvidence,
  AgentImpactedArea,
  AgentImpactedRoute,
  AgentSafetySummary,
  AgentSuggestedCheck,
  AgentTaskBundle,
  AgentTaskBundleFormat,
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

export function renderAgentTaskBundle(bundle: AgentTaskBundle, format: AgentTaskBundleFormat): string {
  if (format === "json") {
    return `${JSON.stringify(bundle, null, 2)}\n`;
  }

  return renderAgentTaskBundleMarkdown(bundle);
}

export function renderAgentTaskBundleMarkdown(bundle: AgentTaskBundle): string {
  const lines = [
    "## CodeDecay Agent Task Bundle",
    "",
    bundle.purpose,
    "",
    `**Overall risk:** ${formatRisk(bundle.summary.riskLevel)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Merge risk | ${bundle.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${bundle.summary.decayScore}/100 |`,
    `| Changed files | ${bundle.summary.changedFiles} |`,
    `| Impacted areas | ${bundle.summary.impactedAreas} |`,
    `| Route/API impacts | ${bundle.summary.impactedRoutes} |`,
    `| Missing-test findings | ${bundle.summary.missingTestFindings} |`,
    `| Weak-test findings | ${bundle.summary.weakTestFindings} |`,
    `| Test proof status | ${bundle.summary.testProofStatus} |`,
    `| Edge cases | ${bundle.summary.edgeCases} |`,
    `| Product failure bundles | ${bundle.summary.productFailureBundles} |`,
    `| Fix tasks | ${bundle.summary.fixTasks} |`,
    "",
    "### Instructions For The Agent",
    ""
  ];

  appendList(lines, bundle.instructions);
  appendHandoff(lines, bundle.agentProfile);
  appendPrompt(lines, bundle.prompt);
  appendEvidence(lines, bundle.evidence);
  appendTasks(lines, bundle.tasks);
  appendChecks(lines, bundle.suggestedChecks);
  appendSkills(lines, bundle.skills);
  appendSafety(lines, bundle);

  return `${lines.join("\n")}\n`;
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

function appendHandoff(lines: string[], profile: AgentProfile): void {
  lines.push("", "### Agent Handoff", "", `**Profile:** ${profile.name}`, "", profile.description, "");
  appendList(lines, profile.handoff);
}

function appendPrompt(lines: string[], prompt: string): void {
  lines.push("", "### Copy-Paste Prompt", "", "```text", prompt, "```");
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

function appendEvidence(lines: string[], evidence: AgentEvidence): void {
  lines.push("", "### Tool Evidence", "");
  lines.push("Changed files:");
  appendList(lines, evidence.changedFiles.map((file) => `${file.status}: \`${file.path}\``));

  lines.push("", "Impacted areas:");
  if (evidence.impactedAreas.length === 0) {
    lines.push("- none detected");
  } else {
    for (const area of evidence.impactedAreas.slice(0, 12)) {
      lines.push(`- ${formatRisk(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
    }
  }

  lines.push("", "Impacted routes and APIs:");
  if (evidence.impactedRoutes.length === 0) {
    lines.push("- none detected");
  } else {
    for (const route of evidence.impactedRoutes.slice(0, 12)) {
      const files = route.files.map((file) => `\`${file}\``).join(", ");
      lines.push(`- ${formatRisk(route.risk)} \`${formatRoute(route)}\` (${routeKindLabel(route)}): ${files}`);

      for (const reason of route.reasons.slice(0, 2)) {
        lines.push(`  - ${reason}`);
      }

      if (route.recommendedTests.length > 0) {
        lines.push(`  - Suggested proof: ${route.recommendedTests[0]}`);
      }
    }
  }

  lines.push("", "Weak or missing test proof:");
  const testFindings = [...evidence.missingTestFindings, ...evidence.weakTestFindings];
  if (testFindings.length === 0) {
    lines.push("- no deterministic weak-test findings");
  } else {
    for (const finding of testFindings.slice(0, 12)) {
      const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
      lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
    }
  }

  lines.push("", "Edge cases to check:");
  appendList(lines, evidence.edgeCases);

  lines.push("", "Product failure bundles:");
  if (evidence.productFailureBundles.length === 0) {
    lines.push("- none");
  } else {
    for (const bundle of evidence.productFailureBundles.slice(0, 8)) {
      const files = bundle.impactedFiles.length > 0 ? bundle.impactedFiles.map((file) => `\`${file}\``).join(", ") : "none";
      lines.push(`- ${formatRisk(bundle.priority)} **${bundle.title}** (\`${bundle.checkId}\`, ${bundle.checkKind})`);
      lines.push(`  - Target: \`${bundle.target.id}\`${bundle.target.baseUrl ? ` at \`${bundle.target.baseUrl}\`` : ""}`);
      lines.push(`  - Failed step ${bundle.failedStep.index}: ${bundle.failedStep.label}`);
      lines.push(`  - Classification: ${bundle.classification.replaceAll("-", " ")}`);
      for (const evidence of bundle.classificationEvidence ?? []) {
        lines.push(`  - Evidence: ${evidence}`);
      }
      lines.push(`  - Impacted files: ${files}`);
      for (const task of bundle.suggestedFixTasks.slice(0, 3)) {
        lines.push(`  - Repair task: ${task}`);
      }
      lines.push(`  - Rerun: \`${bundle.rerunCommand}\``);
    }
  }
}

function appendTasks(lines: string[], tasks: RedteamFixTask[]): void {
  lines.push("", "### Tasks To Complete", "");
  if (tasks.length === 0) {
    lines.push("- no fix tasks generated");
    return;
  }

  for (const task of tasks.slice(0, 20)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(`- ${formatRisk(task.priority)} **${task.title}**${location}: ${task.detail}`);
  }
}

function appendChecks(lines: string[], checks: AgentSuggestedCheck[]): void {
  lines.push("", "### Suggested Local Checks", "");
  if (checks.length === 0) {
    lines.push("- no configured checks or tool adapters found");
    return;
  }

  for (const check of checks.slice(0, 16)) {
    lines.push(`- **${check.name}** (${check.source}, ${check.kind}, not run): \`${check.command}\``);
  }
}

function appendSkills(lines: string[], skills: RedteamSkillSummary[]): void {
  lines.push("", "### Agent Skills", "");
  if (skills.length === 0) {
    lines.push("- no repo-local skills found");
    return;
  }

  for (const skill of skills.slice(0, 8)) {
    lines.push(`- **${skill.title}** (\`${skill.path}\`): ${skill.summary}`);
  }
}

function appendSafety(lines: string[], bundle: AgentTaskBundle): void {
  lines.push(
    "",
    "### Safety And Limits",
    "",
    `- LLM/model called by CodeDecay: ${bundle.safety.llmCalled ? "yes" : "no"}`,
    `- Commands executed by CodeDecay: ${bundle.safety.commandsExecuted ? "yes" : "no"}`,
    `- Telemetry sent: ${bundle.safety.telemetrySent ? "yes" : "no"}`,
    `- Cloud dependency: ${bundle.safety.cloudDependency ? "yes" : "no"}`,
    `- Agent output trusted as evidence: ${bundle.safety.agentOutputTrusted ? "yes" : "no"}`,
    ""
  );

  appendList(lines, bundle.limits);
}

function appendList(lines: string[], items: string[]): void {
  if (items.length === 0) {
    lines.push("- none");
    return;
  }

  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

function formatRisk(level: RiskLevel): string {
  if (level === "high") {
    return "High";
  }

  if (level === "medium") {
    return "Medium";
  }

  return "Low";
}

function formatRoute(route: AgentImpactedRoute): string {
  if (route.methods.length === 0) {
    return route.route;
  }

  return `${route.methods.join(", ")} ${route.route}`;
}

function routeKindLabel(route: AgentImpactedRoute): string {
  if (route.framework === "nextjs" && route.kind === "api-route") {
    return "Next.js API route";
  }

  if (route.framework === "nextjs" && route.kind === "ui-route") {
    return "Next.js UI route";
  }

  if (route.framework === "nextjs" && route.kind === "middleware") {
    return "Next.js middleware";
  }

  if (route.framework === "express") {
    return "Express route handler";
  }

  if (route.framework === "fastify") {
    return "Fastify route handler";
  }

  return "Node route handler";
}
