import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import type { LoadedCodeDecayMemory, MemoryImportResult, MemoryLearnResult, MemoryLearningProposal } from "@submuxhq/codedecay-memory";
import type { ConfigFormat } from "../types";

export function renderMemory(loadedMemory: LoadedCodeDecayMemory, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(loadedMemory, null, 2)}\n`;
  }

  const { memory, sourcePath } = loadedMemory;
  const lines = [
    "## CodeDecay Memory",
    "",
    `**Source:** ${sourcePath ? `\`${sourcePath}\`` : "defaults (no memory file found)"}`,
    "",
    "| Section | Count |",
    "| --- | ---: |",
    `| Flows | ${memory.flows.length} |`,
    `| Commands | ${memory.commands.length} |`,
    `| Invariants | ${memory.invariants.length} |`,
    `| Architecture notes | ${memory.architecture.length} |`,
    `| Past regressions | ${memory.regressions.length} |`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

export function renderMemoryImportResult(input: {
  format: ConfigFormat;
  inputPath: string;
  writtenPath?: string | undefined;
  result: MemoryImportResult;
}): string {
  if (input.format === "json") {
    return `${JSON.stringify(
      {
        tool: "CodeDecay",
        version: CODEDECAY_VERSION,
        inputPath: input.inputPath,
        writtenPath: input.writtenPath,
        added: input.result.added,
        merged: input.result.merged,
        memory: input.result.memory
      },
      null,
      2
    )}\n`;
  }

  const lines = [
    "## CodeDecay Memory Import",
    "",
    `**Input:** \`${input.inputPath}\``,
    `**Applied:** ${input.writtenPath ? "yes" : "no"}`,
    input.writtenPath ? `**Written to:** \`${input.writtenPath}\`` : "**Written to:** preview only",
    "",
    "| Section | Added | Merged |",
    "| --- | ---: | ---: |",
    `| Flows | ${input.result.added.flows} | ${input.result.merged.flows} |`,
    `| Commands | ${input.result.added.commands} | ${input.result.merged.commands} |`,
    `| Invariants | ${input.result.added.invariants} | ${input.result.merged.invariants} |`,
    `| Architecture notes | ${input.result.added.architecture} | ${input.result.merged.architecture} |`,
    `| Past regressions | ${input.result.added.regressions} | ${input.result.merged.regressions} |`,
    "",
    renderMemory({ memory: input.result.memory, sourcePath: input.writtenPath }, "markdown").trim(),
    ""
  ];

  return `${lines.join("\n")}\n`;
}

export function renderMemoryLearnResult(input: {
  format: ConfigFormat;
  inputPath: string;
  writtenPath?: string | undefined;
  result: MemoryLearnResult;
}): string {
  if (input.format === "json") {
    return `${JSON.stringify(
      {
        tool: "CodeDecay",
        version: CODEDECAY_VERSION,
        inputPath: input.inputPath,
        writtenPath: input.writtenPath,
        learned: input.result.learned,
        added: input.result.added,
        merged: input.result.merged,
        proposals: input.result.proposals,
        memory: input.result.memory
      },
      null,
      2
    )}\n`;
  }

  const lines = [
    "## CodeDecay Memory Learn",
    "",
    `**Input:** \`${input.inputPath}\``,
    `**Applied:** ${input.writtenPath ? "yes" : "no"}`,
    input.writtenPath ? `**Written to:** \`${input.writtenPath}\`` : "**Written to:** preview only",
    "",
    "| Section | Learned | Added | Merged |",
    "| --- | ---: | ---: | ---: |",
    `| Flows | ${input.result.learned.flows} | ${input.result.added.flows} | ${input.result.merged.flows} |`,
    `| Commands | ${input.result.learned.commands} | ${input.result.added.commands} | ${input.result.merged.commands} |`,
    `| Invariants | ${input.result.learned.invariants} | ${input.result.added.invariants} | ${input.result.merged.invariants} |`,
    `| Architecture notes | ${input.result.learned.architecture} | ${input.result.added.architecture} | ${input.result.merged.architecture} |`,
    `| Past regressions | ${input.result.learned.regressions} | ${input.result.added.regressions} | ${input.result.merged.regressions} |`,
    "",
    ...renderLearningProposalsMarkdown(input.result.proposals),
    renderMemory({ memory: input.result.memory, sourcePath: input.writtenPath }, "markdown").trim(),
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function renderLearningProposalsMarkdown(proposals: MemoryLearningProposal[]): string[] {
  if (proposals.length === 0) {
    return ["### Proposals", "", "No memory proposals were generated.", ""];
  }

  return [
    "### Proposals",
    "",
    "| Section | Title | Confidence | Source | Why |",
    "| --- | --- | --- | --- | --- |",
    ...proposals.slice(0, 20).map((proposal) =>
      `| ${proposal.section} | ${proposal.title} | ${proposal.confidence} | ${formatProposalSource(proposal)} | ${proposal.why} |`
    ),
    proposals.length > 20 ? `| ... | ${proposals.length - 20} more proposal(s) omitted from markdown | | | |` : undefined,
    ""
  ].filter((line): line is string => line !== undefined);
}

function formatProposalSource(proposal: MemoryLearningProposal): string {
  const parts = [
    proposal.source.type,
    proposal.source.title ? `title: ${proposal.source.title}` : undefined,
    proposal.source.id ? `id: ${proposal.source.id}` : undefined,
    proposal.source.labels && proposal.source.labels.length > 0 ? `labels: ${proposal.source.labels.join(", ")}` : undefined,
    `path: ${proposal.source.path}`,
    `timestamp: ${proposal.timestamp}`
  ].filter((item): item is string => item !== undefined);
  return parts.join("<br>");
}
