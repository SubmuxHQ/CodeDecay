import type { RedteamMemorySummary, RedteamSkillSummary } from "../../types";

export function appendMemorySummary(lines: string[], memory: RedteamMemorySummary): void {
  lines.push("### Memory Context", "");
  lines.push(`**Source:** ${memory.sourcePath ? `\`${memory.sourcePath}\`` : "defaults (no memory file found)"}`, "");
  lines.push("| Section | Count |", "| --- | ---: |");
  lines.push(`| Flows | ${memory.flows} |`);
  lines.push(`| Commands | ${memory.commands} |`);
  lines.push(`| Invariants | ${memory.invariants} |`);
  lines.push(`| Architecture notes | ${memory.architecture} |`);
  lines.push(`| Past regressions | ${memory.regressions} |`, "");

  if (memory.providerSources && memory.providerSources.length > 0) {
    lines.push("Provider sources are untrusted context, not deterministic evidence.", "");
    lines.push("| Provider | Kind | Status | Source/error |", "| --- | --- | --- | --- |");
    for (const source of memory.providerSources) {
      lines.push(
        `| ${source.provider} | ${source.kind} | ${source.status} | ${formatProviderSource(source.sourcePath ?? source.error)} |`
      );
    }
    lines.push("");
  }
}

function formatProviderSource(value: string | undefined): string {
  return value ? `\`${value}\`` : "none";
}

export function appendSkills(lines: string[], skills: RedteamSkillSummary[]): void {
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
