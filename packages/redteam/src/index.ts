import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  CODEDECAY_VERSION,
  compareRiskLevels,
  dedupeStrings,
  type CodeDecayReport,
  type Finding,
  type ImpactedArea,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { LoadedCodeDecaySkills } from "@submuxhq/codedecay-skills";

export type RedteamFormat = "json" | "markdown";
export type RedteamMode = "deterministic";
export type RedteamCheckKind = "test" | "build" | "start" | "probe";
export type RedteamTaskSource = "finding" | "weak-test" | "edge-case" | "configured-check" | "memory";

export interface RedteamReportInput {
  analysisReport: CodeDecayReport;
  config: CodeDecayConfig;
  memory: CodeDecayMemory;
  configSource?: string | undefined;
  memorySource?: string | undefined;
  skills?: LoadedCodeDecaySkills | undefined;
  generatedAt?: string | undefined;
}

export interface RedteamReport {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  mode: RedteamMode;
  base?: string | undefined;
  head?: string | undefined;
  summary: RedteamSummary;
  analysis: CodeDecayReport;
  weakTestFindings: Finding[];
  edgeCases: string[];
  configuredChecks: RedteamConfiguredCheck[];
  memory: RedteamMemorySummary;
  skills: RedteamSkillSummary[];
  fixTasks: RedteamFixTask[];
  safety: RedteamSafetySummary;
}

export interface RedteamSummary {
  mergeRiskScore: number;
  decayScore: number;
  riskLevel: RiskLevel;
  changedFiles: number;
  impactedAreas: number;
  findings: Record<RiskLevel, number>;
  weakTestFindings: number;
  edgeCases: number;
  configuredChecks: number;
  skills: number;
  fixTasks: number;
}

export interface RedteamConfiguredCheck {
  kind: RedteamCheckKind;
  name: string;
  command: string;
  willRun: false;
  timeoutMs?: number | undefined;
}

export interface RedteamMemorySummary {
  sourcePath?: string | undefined;
  flows: number;
  commands: number;
  invariants: number;
  architecture: number;
  regressions: number;
}

export interface RedteamSkillSummary {
  id: string;
  title: string;
  path: string;
  summary: string;
  untrusted: true;
}

export interface RedteamFixTask {
  title: string;
  priority: RiskLevel;
  source: RedteamTaskSource;
  detail: string;
  file?: string | undefined;
  line?: number | undefined;
}

export interface RedteamSafetySummary {
  commandsExecuted: false;
  llmCalled: false;
  telemetrySent: false;
  cloudDependency: false;
  notes: string[];
}

const WEAK_TEST_RULES = new Set([
  "test-without-assertions",
  "snapshot-only-test",
  "mocked-changed-source",
  "unrelated-test-change",
  "copied-implementation-in-test",
  "happy-path-only-test",
  "heavy-mocking",
  "test-bloat"
]);

const EDGE_CASES_BY_AREA: Partial<Record<ImpactedArea["kind"], string[]>> = {
  api: [
    "Exercise the real API route with malformed, missing, and boundary-value payloads.",
    "Verify auth, validation, and downstream consumers through the route, not only helper functions."
  ],
  auth: [
    "Check missing, expired, malformed, and privilege-escalation credentials.",
    "Verify denied paths fail closed and do not silently return privileged defaults."
  ],
  database: [
    "Check migration/schema compatibility with existing records and null/default values.",
    "Verify read and write paths that depend on changed schema fields."
  ],
  ui: [
    "Check loading, empty, error, and permission-denied UI states.",
    "Exercise the real route through browser or component integration tests."
  ],
  config: [
    "Run build/start commands in a clean environment to catch config or packaging regressions.",
    "Verify CI and production-like environment variables still resolve correctly."
  ],
  test: ["Check whether changed tests exercise real production boundaries or only mocked helper logic."]
};

export function createRedteamReport(input: RedteamReportInput): RedteamReport {
  const weakTestFindings = input.analysisReport.findings.filter((finding) => WEAK_TEST_RULES.has(finding.ruleId));
  const edgeCases = suggestEdgeCases(input.analysisReport.impactedAreas);
  const configuredChecks = collectConfiguredChecks(input.config);
  const memory = summarizeMemory(input.memory, input.memorySource);
  const skills = summarizeSkills(input.skills);
  const fixTasks = createFixTasks({
    analysisReport: input.analysisReport,
    weakTestFindings,
    edgeCases,
    configuredChecks,
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
      findings: input.analysisReport.summary.findingCounts,
      weakTestFindings: weakTestFindings.length,
      edgeCases: edgeCases.length,
      configuredChecks: configuredChecks.length,
      skills: skills.length,
      fixTasks: fixTasks.length
    },
    analysis: input.analysisReport,
    weakTestFindings,
    edgeCases,
    configuredChecks,
    memory,
    skills,
    fixTasks,
    safety: {
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false,
      notes: [
        "codedecay redteam is report-only in this MVP.",
        "No configured commands, probes, LLM providers, hosted services, or memory providers are executed.",
        "Use codedecay execute or codedecay differential explicitly when you want configured local checks to run."
      ]
    }
  };

  if (input.analysisReport.base) {
    report.base = input.analysisReport.base;
  }

  if (input.analysisReport.head) {
    report.head = input.analysisReport.head;
  }

  return report;
}

export function renderRedteamReport(report: RedteamReport, format: RedteamFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderRedteamMarkdown(report);
}

export function renderRedteamMarkdown(report: RedteamReport): string {
  const lines: string[] = [
    "## CodeDecay Redteam Report",
    "",
    `**Mode:** ${report.mode}`,
    `**Overall risk:** ${formatRisk(report.summary.riskLevel)}`,
    "",
    "| Signal | Value |",
    "| --- | ---: |",
    `| Merge risk | ${report.summary.mergeRiskScore}/100 |`,
    `| Decay risk | ${report.summary.decayScore}/100 |`,
    `| Changed files | ${report.summary.changedFiles} |`,
    `| Impacted areas | ${report.summary.impactedAreas} |`,
    `| Weak-test findings | ${report.summary.weakTestFindings} |`,
    `| Edge cases suggested | ${report.summary.edgeCases} |`,
    `| Configured checks listed | ${report.summary.configuredChecks} |`,
    ""
  ];

  appendImpactedAreas(lines, report.analysis.impactedAreas);
  appendWeakTests(lines, report.weakTestFindings);
  appendEdgeCases(lines, report.edgeCases);
  appendConfiguredChecks(lines, report.configuredChecks);
  appendFixTasks(lines, report.fixTasks);
  appendMemorySummary(lines, report.memory);
  appendSkills(lines, report.skills);

  lines.push(
    "### Safety",
    "",
    "- Commands executed: no",
    "- LLM/model called: no",
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    "",
    "CodeDecay separates deterministic tool evidence from AI suggestions. This command produces local evidence and fix tasks that your own agent can use.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function collectConfiguredChecks(config: CodeDecayConfig): RedteamConfiguredCheck[] {
  return [
    ...config.commands.test.map((command, index) => createConfiguredCheck("test", `Test command ${index + 1}`, command)),
    ...config.commands.build.map((command, index) => createConfiguredCheck("build", `Build command ${index + 1}`, command)),
    ...config.commands.start.map((command, index) => createConfiguredCheck("start", `Start command ${index + 1}`, command)),
    ...config.probes.map((probe) => createConfiguredCheck("probe", probe.name, probe.command, probe.timeoutMs))
  ];
}

function createConfiguredCheck(
  kind: RedteamCheckKind,
  name: string,
  command: string,
  timeoutMs?: number | undefined
): RedteamConfiguredCheck {
  const check: RedteamConfiguredCheck = {
    kind,
    name,
    command,
    willRun: false
  };

  if (timeoutMs !== undefined) {
    check.timeoutMs = timeoutMs;
  }

  return check;
}

function summarizeMemory(memory: CodeDecayMemory, sourcePath: string | undefined): RedteamMemorySummary {
  const summary: RedteamMemorySummary = {
    flows: memory.flows.length,
    commands: memory.commands.length,
    invariants: memory.invariants.length,
    architecture: memory.architecture.length,
    regressions: memory.regressions.length
  };

  if (sourcePath) {
    summary.sourcePath = sourcePath;
  }

  return summary;
}

function summarizeSkills(loadedSkills: LoadedCodeDecaySkills | undefined): RedteamSkillSummary[] {
  return (loadedSkills?.skills ?? []).map((skill) => ({
    id: skill.id,
    title: skill.title,
    path: skill.path,
    summary: skill.summary,
    untrusted: true
  }));
}

function suggestEdgeCases(areas: ImpactedArea[]): string[] {
  const suggestions = new Set<string>();

  for (const area of areas) {
    for (const suggestion of EDGE_CASES_BY_AREA[area.kind] ?? []) {
      suggestions.add(suggestion);
    }
  }

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}

function createFixTasks(input: {
  analysisReport: CodeDecayReport;
  weakTestFindings: Finding[];
  edgeCases: string[];
  configuredChecks: RedteamConfiguredCheck[];
  memory: CodeDecayMemory;
  skills: RedteamSkillSummary[];
}): RedteamFixTask[] {
  const tasks: RedteamFixTask[] = [];
  const prioritizedFindings = input.analysisReport.findings
    .filter((finding) => finding.severity !== "low")
    .slice(0, 8);
  const findings = prioritizedFindings.length > 0 ? prioritizedFindings : input.analysisReport.findings.slice(0, 5);

  for (const finding of findings) {
    tasks.push({
      title: `Investigate ${finding.title}`,
      priority: finding.severity,
      source: WEAK_TEST_RULES.has(finding.ruleId) ? "weak-test" : "finding",
      detail: finding.description,
      file: finding.file,
      line: finding.line
    });
  }

  for (const edgeCase of input.edgeCases.slice(0, 8)) {
    tasks.push({
      title: "Add or run an edge-case check",
      priority: edgeCasePriority(input.analysisReport.impactedAreas),
      source: "edge-case",
      detail: edgeCase
    });
  }

  for (const check of input.configuredChecks.slice(0, 8)) {
    tasks.push({
      title: `Consider running configured ${check.kind} check`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "configured-check",
      detail: `${check.name}: ${check.command}`
    });
  }

  for (const invariant of input.memory.invariants.slice(0, 4)) {
    tasks.push({
      title: `Verify invariant: ${invariant.name}`,
      priority: invariant.severity ?? "medium",
      source: "memory",
      detail: invariant.description
    });
  }

  for (const regression of input.memory.regressions.slice(0, 4)) {
    tasks.push({
      title: `Re-check past regression: ${regression.title}`,
      priority: regression.severity ?? "high",
      source: "memory",
      detail: regression.check ? `${regression.description} Check: ${regression.check}` : regression.description
    });
  }

  for (const skill of input.skills.slice(0, 4)) {
    tasks.push({
      title: `Review with skill: ${skill.title}`,
      priority: input.analysisReport.summary.riskLevel === "high" ? "medium" : "low",
      source: "memory",
      detail: `${skill.summary} (${skill.path})`
    });
  }

  return dedupeTasks(tasks).slice(0, 20);
}

function edgeCasePriority(areas: ImpactedArea[]): RiskLevel {
  if (areas.some((area) => area.risk === "high")) {
    return "high";
  }

  if (areas.some((area) => area.risk === "medium")) {
    return "medium";
  }

  return "low";
}

function dedupeTasks(tasks: RedteamFixTask[]): RedteamFixTask[] {
  const seen = new Set<string>();
  const deduped: RedteamFixTask[] = [];

  for (const task of tasks) {
    const key = `${task.title}:${task.detail}:${task.file ?? ""}:${task.line ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(task);
  }

  return deduped.sort((left, right) => {
    const risk = compareRiskLevels(right.priority, left.priority);
    if (risk !== 0) {
      return risk;
    }

    return left.title.localeCompare(right.title);
  });
}

function appendImpactedAreas(lines: string[], areas: ImpactedArea[]): void {
  if (areas.length === 0) {
    lines.push("### What Could Break", "", "No impacted product/system areas were detected.", "");
    return;
  }

  lines.push("### What Could Break", "");
  for (const area of areas.slice(0, 12)) {
    lines.push(`- ${formatRisk(area.risk)} **${area.name}** (${area.kind}): ${area.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push("");
}

function appendWeakTests(lines: string[], findings: Finding[]): void {
  lines.push("### Test Reality Check", "");
  if (findings.length === 0) {
    lines.push("No weak-test findings were detected by deterministic rules.", "");
    return;
  }

  for (const finding of findings.slice(0, 10)) {
    const location = finding.file ? ` in \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "";
    lines.push(`- ${formatRisk(finding.severity)} **${finding.title}**${location}: ${finding.description}`);
  }
  lines.push("");
}

function appendEdgeCases(lines: string[], edgeCases: string[]): void {
  lines.push("### Missing Edge Cases To Check", "");
  for (const edgeCase of edgeCases.slice(0, 12)) {
    lines.push(`- ${edgeCase}`);
  }
  lines.push("");
}

function appendConfiguredChecks(lines: string[], checks: RedteamConfiguredCheck[]): void {
  lines.push("### Configured Checks Available", "");
  if (checks.length === 0) {
    lines.push("No test/build/start/probe commands are configured.", "");
    return;
  }

  for (const check of checks.slice(0, 12)) {
    lines.push(`- **${check.name}** (${check.kind}, not run): \`${check.command}\``);
  }
  lines.push("");
}

function appendFixTasks(lines: string[], tasks: RedteamFixTask[]): void {
  lines.push("### Tasks For Your Coding Agent", "");
  if (tasks.length === 0) {
    lines.push("No fix tasks were generated.", "");
    return;
  }

  for (const task of tasks.slice(0, 12)) {
    const location = task.file ? ` (\`${task.file}${task.line ? `:${task.line}` : ""}\`)` : "";
    lines.push(`- ${formatRisk(task.priority)} **${task.title}**${location}: ${task.detail}`);
  }
  lines.push("");
}

function appendMemorySummary(lines: string[], memory: RedteamMemorySummary): void {
  lines.push("### Memory Context", "");
  lines.push(`**Source:** ${memory.sourcePath ? `\`${memory.sourcePath}\`` : "defaults (no memory file found)"}`, "");
  lines.push("| Section | Count |", "| --- | ---: |");
  lines.push(`| Flows | ${memory.flows} |`);
  lines.push(`| Commands | ${memory.commands} |`);
  lines.push(`| Invariants | ${memory.invariants} |`);
  lines.push(`| Architecture notes | ${memory.architecture} |`);
  lines.push(`| Past regressions | ${memory.regressions} |`, "");
}

function appendSkills(lines: string[], skills: RedteamSkillSummary[]): void {
  lines.push("### Agent Skills", "");
  if (skills.length === 0) {
    lines.push("No repo-local agent skills found under `.agents/skills`.", "");
    return;
  }

  for (const skill of skills.slice(0, 8)) {
    lines.push(`- **${skill.title}** (\`${skill.path}\`): ${skill.summary}`);
  }
  lines.push("", "Skill content is local context for your own agent. CodeDecay does not execute it.", "");
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

export function weakTestRuleIds(): string[] {
  return dedupeStrings([...WEAK_TEST_RULES]);
}
