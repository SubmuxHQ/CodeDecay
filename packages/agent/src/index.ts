import type { ImpactedRoute, RiskLevel } from "@submuxhq/codedecay-core";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamReport,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "@submuxhq/codedecay-redteam";

export type AgentTaskBundleFormat = "json" | "markdown";

export const AGENT_PROFILE_IDS = [
  "generic",
  "codex",
  "claude-code",
  "cursor",
  "pi",
  "opencode",
  "desktop"
] as const;

export type AgentProfileId = (typeof AGENT_PROFILE_IDS)[number];

export interface AgentProfile {
  id: AgentProfileId;
  name: string;
  description: string;
  promptContext: string;
  handoff: string[];
}

export interface CreateAgentTaskBundleOptions {
  profile?: AgentProfileId | undefined;
}

export interface AgentTaskBundle {
  tool: "CodeDecay";
  version: string;
  mode: "agent-task-bundle";
  generatedAt: string;
  purpose: string;
  agentProfile: AgentProfile;
  summary: AgentTaskSummary;
  prompt: string;
  instructions: string[];
  evidence: AgentEvidence;
  tasks: RedteamFixTask[];
  suggestedChecks: AgentSuggestedCheck[];
  skills: RedteamSkillSummary[];
  safety: AgentSafetySummary;
  limits: string[];
}

export interface AgentTaskSummary {
  riskLevel: RiskLevel;
  mergeRiskScore: number;
  decayScore: number;
  changedFiles: number;
  impactedAreas: number;
  impactedRoutes: number;
  missingTestFindings: number;
  weakTestFindings: number;
  testProofStatus: string;
  edgeCases: number;
  fixTasks: number;
}

export interface AgentEvidence {
  changedFiles: AgentChangedFile[];
  impactedAreas: AgentImpactedArea[];
  impactedRoutes: AgentImpactedRoute[];
  weakTestFindings: AgentFindingEvidence[];
  missingTestFindings: AgentFindingEvidence[];
  edgeCases: string[];
  memory: RedteamReport["memory"];
}

export interface AgentChangedFile {
  path: string;
  status: string;
}

export interface AgentImpactedArea {
  kind: string;
  name: string;
  risk: RiskLevel;
  files: string[];
}

export interface AgentImpactedRoute {
  framework: ImpactedRoute["framework"];
  kind: ImpactedRoute["kind"];
  route: string;
  methods: string[];
  risk: RiskLevel;
  files: string[];
  reasons: string[];
  recommendedTests: string[];
}

export interface AgentFindingEvidence {
  title: string;
  severity: RiskLevel;
  description: string;
  file?: string | undefined;
  line?: number | undefined;
  ruleId: string;
}

export interface AgentSuggestedCheck {
  source: "configured-command" | "tool-adapter";
  name: string;
  kind: string;
  command: string;
  willRun: false;
}

export interface AgentSafetySummary {
  llmCalled: false;
  commandsExecuted: false;
  telemetrySent: false;
  cloudDependency: false;
  agentOutputTrusted: false;
}

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

const AGENT_PROFILES: Record<AgentProfileId, AgentProfile> = {
  generic: {
    id: "generic",
    name: "Generic user-owned agent",
    description:
      "Give this bundle to a user-owned coding agent such as Codex, Claude Code, Cursor, Pi, OpenCode, a desktop agent, or another local tool.",
    promptContext: "Use whichever local repo tools and editing workflow the user has available.",
    handoff: [
      "Copy the prompt and bundle into the user's preferred coding agent.",
      "Keep the CodeDecay evidence visible while making fixes.",
      "Ask the agent to change code/tests only after explaining which real behavior path is at risk."
    ]
  },
  codex: {
    id: "codex",
    name: "Codex",
    description: "Handoff for a Codex session running in the repository.",
    promptContext: "Use the current Codex repo session and local tools as the user permits.",
    handoff: [
      "Paste the prompt and bundle into the Codex repo session.",
      "Ask Codex to inspect the cited files before editing.",
      "Have Codex run only configured or user-approved checks after changes."
    ]
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    description: "Handoff for a Claude Code session running in the repository.",
    promptContext: "Use Claude Code with the bundle as local tool evidence, not as trusted proof.",
    handoff: [
      "Paste the prompt and bundle into Claude Code.",
      "Ask Claude Code to map each fix to impacted files, weak tests, and edge cases.",
      "Have Claude Code report which checks should be rerun after edits."
    ]
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    description: "Handoff for Cursor chat or agent workflows in the repository.",
    promptContext: "Use Cursor with the bundle attached or pasted as PR safety context.",
    handoff: [
      "Paste the prompt and bundle into Cursor chat or agent mode.",
      "Keep edits focused on the listed tasks and impacted areas.",
      "Ask Cursor to add tests that hit real API, UI, database, or downstream behavior."
    ]
  },
  pi: {
    id: "pi",
    name: "Pi",
    description: "Handoff for a Pi harness or Pi-compatible agent workflow.",
    promptContext: "Use Pi as the user-owned agent harness while treating CodeDecay evidence as local tool context.",
    handoff: [
      "Attach or paste the prompt and bundle into the Pi harness workflow.",
      "Ask Pi to produce a fix plan that maps each proposed change to CodeDecay evidence.",
      "Have Pi run only configured or user-approved checks after edits."
    ]
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    description: "Handoff for an OpenCode session running in the repository.",
    promptContext: "Use OpenCode with the bundle as PR safety context, not as trusted proof.",
    handoff: [
      "Paste the prompt and bundle into OpenCode.",
      "Ask OpenCode to start with impacted routes/APIs, weak tests, and missing edge cases.",
      "Have OpenCode report which checks verify the real behavior path before merge."
    ]
  },
  desktop: {
    id: "desktop",
    name: "Desktop/local agent",
    description: "Handoff for desktop agents or local agent apps that can read repository context.",
    promptContext: "Use the desktop/local agent's repo context while treating CodeDecay evidence as untrusted until verified.",
    handoff: [
      "Attach or paste the bundle into the desktop/local agent.",
      "Confirm the agent is working on the same repository and branch.",
      "Ask for a fix plan first, then apply changes only when the plan maps to CodeDecay evidence."
    ]
  }
};

export function isAgentProfileId(value: string): value is AgentProfileId {
  return AGENT_PROFILE_IDS.includes(value as AgentProfileId);
}

export function getAgentProfile(profile: AgentProfileId = "generic"): AgentProfile {
  const definition = AGENT_PROFILES[profile];

  return {
    ...definition,
    handoff: [...definition.handoff]
  };
}

export function listAgentProfiles(): AgentProfile[] {
  return AGENT_PROFILE_IDS.map((profile) => getAgentProfile(profile));
}

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
    `The bundle reports ${summary.changedFiles} changed files, ${summary.impactedAreas} impacted areas, ${summary.impactedRoutes} route/API impacts, ${summary.missingTestFindings} missing-test findings, ${summary.weakTestFindings} weak-test findings, ${summary.edgeCases} edge cases, and ${summary.fixTasks} fix tasks.`,
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
