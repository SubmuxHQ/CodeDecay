import { CODEDECAY_VERSION } from "@submuxhq/codedecay-core";
import type { LoadedCodeDecayMemory, MemoryImportResult, MemoryLearnResult } from "@submuxhq/codedecay-memory";
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
    renderMemory({ memory: input.result.memory, sourcePath: input.writtenPath }, "markdown").trim(),
    ""
  ];

  return `${lines.join("\n")}\n`;
}
