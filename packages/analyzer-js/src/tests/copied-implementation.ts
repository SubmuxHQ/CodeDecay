import type { FileChange } from "@submuxhq/codedecay-core";
import { normalizeImplementationLine } from "../code/normalize";

interface SourceLogicBlock {
  sourcePath: string;
  key: string;
}

export interface CopiedImplementationBlock {
  sourcePath: string;
  testLine: number;
}

export function createSourceLogicBlocks(changedSourceFiles: FileChange[]): SourceLogicBlock[] {
  const blocks: SourceLogicBlock[] = [];

  for (const change of changedSourceFiles) {
    const normalizedLines = change.addedLines
      .map((line) => normalizeImplementationLine(line.content))
      .filter((line) => line.length >= 8);

    for (let index = 0; index <= normalizedLines.length - 3; index += 1) {
      const key = normalizedLines.slice(index, index + 3).join("\n");
      blocks.push({
        sourcePath: change.path,
        key
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

  for (let index = 0; index <= normalizedTestLines.length - 3; index += 1) {
    const blockLines = normalizedTestLines.slice(index, index + 3);
    const key = blockLines.map((line) => line.content).join("\n");
    const match = sourceBlocks.find((sourceBlock) => sourceBlock.key === key);
    if (match) {
      return {
        sourcePath: match.sourcePath,
        testLine: blockLines[0]?.line ?? 1
      };
    }
  }

  return undefined;
}
