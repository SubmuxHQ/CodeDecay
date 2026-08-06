import type { AnalyzerResult } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";
import { firstLine, firstMatchingFile, matchesMemoryEntry } from "./context-matchers";
import { retrieveApprovedLearningEvents } from "./learning-events";
import { isEmptyMemory } from "./schema";
import type { MemoryContextInput } from "./types";

export function applyMemoryContext(input: MemoryContextInput): AnalyzerResult {
  if (isEmptyMemory(input.memory)) {
    return input.analyzerResult;
  }

  const findings = [...input.analyzerResult.findings];
  const recommendedTests = [...input.analyzerResult.recommendedTests];

  for (const invariant of input.memory.invariants) {
    const match = firstMatchingFile(invariant, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-invariant-impacted",
      title: "Project invariant may be impacted",
      description: `Untrusted memory context: invariant "${invariant.name}" applies to this change. ${invariant.description}`,
      severity: invariant.severity ?? "medium",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
    recommendedTests.push(`Verify invariant: ${invariant.name}`);
  }

  for (const regression of input.memory.regressions) {
    const match = firstMatchingFile(regression, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-past-regression-area",
      title: "Past regression area changed",
      description: `Untrusted memory context: past regression "${regression.title}" may be relevant. ${regression.description}`,
      severity: regression.severity ?? "high",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
    recommendedTests.push(regression.check ? `Regression check: ${regression.check}` : `Regression check: ${regression.title}`);
  }

  for (const flow of input.memory.flows) {
    if (!matchesMemoryEntry(flow, input.changedFiles, input.impactedAreas)) {
      continue;
    }

    recommendedTests.push(`Verify flow: ${flow.name}`);
    recommendedTests.push(...(flow.checks ?? []).map((check) => `Flow check (${flow.name}): ${check}`));
  }

  for (const command of input.memory.commands) {
    if (!matchesMemoryEntry(command, input.changedFiles, input.impactedAreas)) {
      continue;
    }

    recommendedTests.push(`Run project command: ${command.name} (${command.command})`);
  }

  for (const note of input.memory.architecture) {
    const match = firstMatchingFile(note, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-architecture-note",
      title: "Architecture note applies",
      description: `Untrusted architecture context: ${note.title}: ${note.note}`,
      severity: "low",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });
  }

  const learning = retrieveApprovedLearningEvents({
    memory: input.memory,
    changedFiles: input.changedFiles,
    impactedAreas: input.impactedAreas
  });

  for (const entry of learning.included) {
    const event = entry.event;
    if (event.kind === "refuted-hypothesis") {
      // Narrow suppression only: do not emit a global disable finding.
      continue;
    }

    const match = firstMatchingFile(event.scope, input.changedFiles, input.impactedAreas);
    if (!match) {
      continue;
    }

    findings.push({
      ruleId: "memory-learning-influenced",
      title: "Prior approved learning applies",
      description: `Prior learning influenced this investigation: ${event.title}. ${event.summary}${
        event.invariant ? ` Invariant: ${event.invariant}.` : ""
      } (${entry.reason})`,
      severity: event.kind === "confirmed-regression" || event.kind === "incident" ? "high" : "medium",
      category: "regression",
      file: match.path,
      line: firstLine(match)
    });

    if (event.proofRecipe) {
      recommendedTests.push(`Learning proof recipe (${event.title}): ${event.proofRecipe}`);
    } else if (event.invariant) {
      recommendedTests.push(`Verify learned invariant (${event.title}): ${event.invariant}`);
    }
  }

  return {
    ...input.analyzerResult,
    findings,
    recommendedTests: dedupeStrings(recommendedTests)
  };
}
