import type { FileChange, ImpactedArea } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import { retrieveApprovedLearningEvents } from "@submuxhq/codedecay-memory";
import type { LoadedCodeDecaySkills } from "@submuxhq/codedecay-skills";
import type { RedteamMemoryProviderSource, RedteamMemorySummary, RedteamSkillSummary } from "./types";

export function summarizeMemory(
  memory: CodeDecayMemory,
  sourcePath: string | undefined,
  providerSources: RedteamMemoryProviderSource[] = [],
  retrieval?: {
    changedFiles: FileChange[];
    impactedAreas: ImpactedArea[];
    repository?: string | undefined;
  }
): RedteamMemorySummary {
  const summary: RedteamMemorySummary = {
    flows: memory.flows.length,
    commands: memory.commands.length,
    invariants: memory.invariants.length,
    architecture: memory.architecture.length,
    regressions: memory.regressions.length,
    learningEvents: memory.learningEvents?.length ?? 0
  };

  if (sourcePath) {
    summary.sourcePath = sourcePath;
  }

  if (providerSources.length > 0) {
    summary.providerSources = providerSources;
    const providerFailures = providerSources.filter((source) => source.status === "failed");
    if (providerFailures.length > 0) {
      summary.providerFailures = providerFailures;
    }
  }

  if (retrieval) {
    const learning = retrieveApprovedLearningEvents({
      memory,
      changedFiles: retrieval.changedFiles,
      impactedAreas: retrieval.impactedAreas,
      repository: retrieval.repository
    });
    const influences = learning.included
      .filter((entry) => entry.event.kind !== "refuted-hypothesis")
      .map((entry) => `Prior learning influenced proof planning: ${entry.event.title} (${entry.reason})`);
    summary.approvedLearningsApplied = influences.length;
    if (influences.length > 0) {
      summary.learningInfluences = influences;
    }
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
