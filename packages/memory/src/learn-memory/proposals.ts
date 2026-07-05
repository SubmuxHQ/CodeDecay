import { dedupeStrings } from "@submuxhq/codedecay-core";
import type {
  MemoryArchitectureNote,
  MemoryCommand,
  MemoryFlow,
  MemoryImportCounts,
  MemoryInvariant,
  MemoryLearningProposal,
  MemoryLearningProposalConfidence,
  MemoryLearningProposalSource,
  MemoryRegression
} from "../types";
import { asRecord, stringArray, stringValue } from "./records";

export interface MemoryLearningContext {
  sourcePath: string;
  timestamp: string;
  proposals: MemoryLearningProposal[];
}

export type ProposedMemoryEntry =
  | MemoryFlow
  | MemoryCommand
  | MemoryInvariant
  | MemoryArchitectureNote
  | MemoryRegression;

export function createMemoryLearningContext(sourcePath: string, timestamp: string): MemoryLearningContext {
  return {
    sourcePath,
    timestamp,
    proposals: []
  };
}

export function recordMemoryProposal(input: {
  context?: MemoryLearningContext | undefined;
  section: keyof MemoryImportCounts;
  title: string;
  entry: ProposedMemoryEntry;
  source: MemoryLearningProposalSource;
  confidence: MemoryLearningProposalConfidence;
  why: string;
}): void {
  if (!input.context) {
    return;
  }

  input.context.proposals.push({
    id: proposalId(input.section, input.title, input.entry, input.source),
    section: input.section,
    title: input.title,
    source: input.source,
    confidence: input.confidence,
    timestamp: input.context.timestamp,
    why: input.why,
    entry: input.entry
  });
}

export function finalizeMemoryProposals(proposals: MemoryLearningProposal[]): MemoryLearningProposal[] {
  const map = new Map<string, MemoryLearningProposal>();
  for (const proposal of proposals) {
    if (!map.has(proposal.id)) {
      map.set(proposal.id, cloneProposal(proposal));
    }
  }

  return [...map.values()].sort((left, right) =>
    `${left.section}:${left.title}`.localeCompare(`${right.section}:${right.title}`)
  );
}

export function learningSource(
  type: MemoryLearningProposalSource["type"],
  sourcePath: string,
  object: Record<string, unknown>,
  fallbackTitle: string
): MemoryLearningProposalSource {
  const source: MemoryLearningProposalSource = {
    type,
    path: sourcePath,
    title: stringValue(object.title) ?? stringValue(object.name) ?? fallbackTitle
  };
  const url = stringValue(object.url) ?? stringValue(object.html_url) ?? stringValue(object.permalink);
  const id = idValue(object.id) ?? idValue(object.number) ?? idValue(object.runId) ?? idValue(object.workflowRunId);
  const labels = collectSourceLabels(object);

  if (url) {
    source.url = url;
  }

  if (id) {
    source.id = id;
  }

  if (labels.length > 0) {
    source.labels = labels;
  }

  return source;
}

function idValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return stringValue(value);
}

function collectSourceLabels(object: Record<string, unknown>): string[] {
  return dedupeStrings([
    ...stringArray(object.labels),
    ...stringArray(object.tags),
    ...normalizeObjectLabelArray(object.labels)
  ]);
}

function normalizeObjectLabelArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .flatMap((item) => (item ? stringValue(item.name) ?? [] : []));
}

function proposalId(
  section: keyof MemoryImportCounts,
  title: string,
  entry: ProposedMemoryEntry,
  source: MemoryLearningProposalSource
): string {
  const matcher = [
    ...(entry.files ?? []),
    ...(entry.areas ?? []),
    ...(entry.productPaths ?? [])
  ].join(",");
  return [
    section,
    normalizeKey(title),
    normalizeKey(source.type),
    normalizeKey(source.path),
    normalizeKey(matcher)
  ].join(":");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cloneProposal(proposal: MemoryLearningProposal): MemoryLearningProposal {
  return {
    ...proposal,
    source: {
      ...proposal.source,
      labels: proposal.source.labels ? [...proposal.source.labels] : undefined
    },
    entry: {
      ...proposal.entry,
      files: proposal.entry.files ? [...proposal.entry.files] : undefined,
      areas: proposal.entry.areas ? [...proposal.entry.areas] : undefined,
      productPaths: proposal.entry.productPaths ? [...proposal.entry.productPaths] : undefined
    }
  };
}
