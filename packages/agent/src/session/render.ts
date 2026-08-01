import type { AgentSessionResult } from "./types";

export type AgentSessionFormat = "markdown" | "json";

export function renderAgentSessionResult(result: AgentSessionResult, format: AgentSessionFormat): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  return renderAgentSessionMarkdown(result);
}

export function renderAgentSessionMarkdown(result: AgentSessionResult): string {
  const lines: string[] = [
    "# CodeDecay Agent Session",
    "",
    `- Session: \`${result.session.id}\``,
    `- Operation: ${result.operation}`,
    `- Status: ${result.session.status}`,
    `- Artifact: \`${result.sessionPath}\``,
    `- Commands executed: ${result.session.safety.commandsExecuted ? "yes" : "no"}`,
    `- LLM/model called: ${result.session.safety.llmCalled ? "yes" : "no"}`,
    `- Agent output trusted: ${result.session.safety.agentOutputTrusted ? "yes" : "no"}`
  ];

  if (result.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (result.guidance) {
    appendList(lines, "Implementation Brief", result.guidance.implementationBrief);
    appendList(lines, "Proof Plan", result.guidance.proofPlan);
    appendList(lines, "Agent Instructions", result.guidance.agentInstructions);
    appendList(lines, "Non-Goals", result.guidance.nonGoals);
    appendList(lines, "Safety Constraints", result.guidance.safetyConstraints);
    appendList(lines, "Configured Checks", result.guidance.configuredChecks);
  }

  lines.push("", "## Evidence", "");
  for (const evidence of result.session.evidenceRefs.slice(-8)) {
    const artifact = evidence.artifactPath ? ` (${evidence.artifactPath})` : "";
    lines.push(`- \`${evidence.id}\` ${evidence.kind}: ${evidence.summary}${artifact}`);
  }

  if (result.session.checkpoints.length > 0) {
    lines.push("", "## Checkpoints", "");
    for (const checkpoint of result.session.checkpoints.slice(-6)) {
      const dirtyFiles = checkpoint.dirtyFiles.length ? checkpoint.dirtyFiles.join(", ") : "clean";
      lines.push(`- \`${checkpoint.id}\` ${checkpoint.kind}: ${checkpoint.summary} [${dirtyFiles}]`);
    }
  }

  if (result.verification ?? result.session.verification) {
    const verification = result.verification ?? result.session.verification;
    lines.push("", "## Verification Boundary", "");
    lines.push(`- Verdict: ${verification?.verdict ?? "needs-verification"}`);
    lines.push(`- Commands executed: ${verification?.commandsExecuted ? "yes" : "no"}`);
    for (const check of verification?.allowedChecks ?? []) {
      lines.push(`- Allowed check: ${check}`);
    }
    for (const criterion of verification?.acceptanceCriteria ?? []) {
      lines.push(`- ${criterion.id}: ${criterion.status}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function appendList(lines: string[], title: string, values: string[]): void {
  if (values.length === 0) {
    return;
  }
  lines.push("", `## ${title}`, "");
  for (const value of values) {
    lines.push(`- ${value}`);
  }
}
