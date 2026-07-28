import type { FileChange } from "@submuxhq/codedecay-core";
import { normalizeImplementationLine } from "../code/normalize";
import { readChangedFile } from "./line-matches";
import { executableImplementationLines } from "./copied-implementation-ast";

const MAX_BLOCK_EXCERPT_LENGTH = 240;

interface SourceLogicBlock {
  sourcePath: string;
  sourceStartLine: number;
  sourceEndLine: number;
  key: string;
  excerpt: string;
}

export interface CopiedImplementationBlock {
  sourcePath: string;
  sourceStartLine: number;
  sourceEndLine: number;
  testLine: number;
  testEndLine: number;
  excerpt: string;
}

export function createSourceLogicBlocks(rootDir: string, changedSourceFiles: FileChange[]): SourceLogicBlock[] {
  const blocks: SourceLogicBlock[] = [];

  for (const change of changedSourceFiles) {
    const sourceContent =
      readChangedFile(rootDir, change.path) ?? change.addedLines.map((line) => line.content).join("\n");
    const executableLines = executableImplementationLines(sourceContent);
    const normalizedLines = change.addedLines
      .map((line) => ({
        line: line.line,
        content: normalizeImplementationLine(line.content)
      }))
      .filter((line) => line.content.length >= 8);

    for (let index = 0; index <= normalizedLines.length - 3; index += 1) {
      const blockLines = normalizedLines.slice(index, index + 3);
      const startLine = blockLines[0]?.line;
      const endLine = blockLines.at(-1)?.line;
      if (
        startLine === undefined ||
        endLine === undefined ||
        !hasLineBetween(executableLines, startLine, endLine)
      ) {
        continue;
      }

      const key = blockLines.map((line) => line.content).join("\n");
      blocks.push({
        sourcePath: change.path,
        sourceStartLine: startLine,
        sourceEndLine: endLine,
        key,
        excerpt: blockExcerpt(blockLines)
      });
    }
  }

  return blocks;
}

export function findCopiedImplementationBlock(
  testLines: string[],
  sourceBlocks: SourceLogicBlock[]
): CopiedImplementationBlock | undefined {
  if (sourceBlocks.length === 0) {
    return undefined;
  }

  const normalizedTestLines = testLines
    .map((content, index) => ({
      line: index + 1,
      content: normalizeImplementationLine(content)
    }))
    .filter((line) => line.content.length >= 8);
  const executableLines = executableImplementationLines(testLines.join("\n"));

  for (let index = 0; index <= normalizedTestLines.length - 3; index += 1) {
    const blockLines = normalizedTestLines.slice(index, index + 3);
    const startLine = blockLines[0]?.line;
    const endLine = blockLines.at(-1)?.line;
    if (
      startLine === undefined ||
      endLine === undefined ||
      !hasLineBetween(executableLines, startLine, endLine)
    ) {
      continue;
    }

    const key = blockLines.map((line) => line.content).join("\n");
    const match = sourceBlocks.find((sourceBlock) => sourceBlock.key === key);
    if (match) {
      return {
        sourcePath: match.sourcePath,
        sourceStartLine: match.sourceStartLine,
        sourceEndLine: match.sourceEndLine,
        testLine: startLine,
        testEndLine: endLine,
        excerpt: match.excerpt
      };
    }
  }

  return undefined;
}

function hasLineBetween(lines: Set<number>, startLine: number, endLine: number): boolean {
  for (const line of lines) {
    if (line >= startLine && line <= endLine) {
      return true;
    }
  }
  return false;
}

function blockExcerpt(lines: Array<{ content: string }>): string {
  const excerpt = lines.map((line) => line.content).join(" | ");
  return excerpt.length <= MAX_BLOCK_EXCERPT_LENGTH
    ? excerpt
    : `${excerpt.slice(0, MAX_BLOCK_EXCERPT_LENGTH - 3)}...`;
}
