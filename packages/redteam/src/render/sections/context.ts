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
