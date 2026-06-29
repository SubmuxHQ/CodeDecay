import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { LoadedCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { RedteamMemorySummary, RedteamSkillSummary } from "./types";

export function summarizeMemory(memory: CodeDecayMemory, sourcePath: string | undefined): RedteamMemorySummary {
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

export function summarizeSkills(loadedSkills: LoadedCodeDecaySkills | undefined): RedteamSkillSummary[] {
  return (loadedSkills?.skills ?? []).map((skill) => ({
    id: skill.id,
    title: skill.title,
    path: skill.path,
    summary: skill.summary,
    untrusted: true
  }));
}
