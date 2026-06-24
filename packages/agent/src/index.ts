import type { RiskLevel } from "@submuxhq/codedecay-core";
import type {
  RedteamConfiguredCheck,
  RedteamFixTask,
  RedteamReport,
  RedteamSkillSummary,
  RedteamToolAdapterPlan
} from "@submuxhq/codedecay-redteam";

export type AgentTaskBundleFormat = "json" | "markdown";

export interface AgentTaskBundle {
  tool: "CodeDecay";
  version: string;
  mode: "agent-task-bundle";
  generatedAt: string;
  purpose: string;
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
  weakTestFindings: number;
  testProofStatus: string;
  edgeCases: number;
  fixTasks: number;
}

export interface AgentEvidence {
  changedFiles: AgentChangedFile[];
  impactedAreas: AgentImpactedArea[];
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
  "Start from impacted areas and weak-test findings before editing code.",
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

export function createAgentTaskBundle(report: RedteamReport): AgentTaskBundle {
  const summary: AgentTaskSummary = {
    riskLevel: report.summary.riskLevel,
    mergeRiskScore: report.summary.mergeRiskScore,
    decayScore: report.summary.decayScore,
    changedFiles: report.summary.changedFiles,
    impactedAreas: report.summary.impactedAreas,
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
    purpose:
      "Give this bundle to a user-owned coding agent such as Codex, Claude Code, Cursor, or another local agent to fix overlooked PR risks.",
    summary,
    prompt: createPortableAgentPrompt(summary),
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
    `| Weak-test findings | ${bundle.summary.weakTestFindings} |`,
    `| Test proof status | ${bundle.summary.testProofStatus} |`,
    `| Edge cases | ${bundle.summary.edgeCases} |`,
    `| Fix tasks | ${bundle.summary.fixTasks} |`,
    "",
    "### Instructions For The Agent",
    ""
  ];

  appendList(lines, bundle.instructions);
  appendPrompt(lines, bundle.prompt);
  appendEvidence(lines, bundle.evidence);
  appendTasks(lines, bundle.tasks);
  appendChecks(lines, bundle.suggestedChecks);
  appendSkills(lines, bundle.skills);
  appendSafety(lines, bundle);

  return `${lines.join("\n")}\n`;
}

function createPortableAgentPrompt(summary: AgentTaskSummary): string {
  return [
    "You are helping fix a pull request using a CodeDecay agent task bundle.",
    "Treat the bundle as local tool evidence, not as a guarantee that the PR is safe.",
    `Current CodeDecay risk is ${formatRisk(summary.riskLevel)} with merge risk ${summary.mergeRiskScore}/100 and decay risk ${summary.decayScore}/100.`,
    `The bundle reports ${summary.changedFiles} changed files, ${summary.impactedAreas} impacted areas, ${summary.weakTestFindings} weak-test findings, ${summary.edgeCases} edge cases, and ${summary.fixTasks} fix tasks.`,
    "Your job:",
    "1. Start with high-risk impacted areas and weak or missing test proof.",
    "2. Identify what real API, UI, database, job, config, or downstream behavior could break.",
    "3. Add or improve tests that exercise the real behavior path instead of only mocked or copied implementation logic.",
    "4. Cover the listed edge cases and any additional edge cases supported by the evidence.",
    "5. Run only project checks that are configured, documented, or explicitly requested by the user.",
    "6. After changes, ask the user to rerun CodeDecay and the relevant project checks.",
    "Do not treat your own answer as proof. Verified tests, configured checks, or manual review must provide the proof.",
    "CodeDecay did not call an LLM, execute commands, send telemetry, or depend on CodeDecayCloud to create this bundle."
  ].join("\n");
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
