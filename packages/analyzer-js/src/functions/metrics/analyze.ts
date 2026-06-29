import { parse } from "@babel/parser";
import type { FileChange } from "@submuxhq/codedecay-core";
import { walk } from "../../ast/traverse";
import { firstLine } from "../../findings/builders";
import { estimateComplexity } from "./complexity";
import { getFunctionName, isFunctionNode, readNodeLoc } from "./nodes";
import type { FunctionMetric } from "./types";

export function analyzeFunctions(change: FileChange, content: string): FunctionMetric[] {
  const changedLines = new Set(change.addedLines.map((line) => line.line));

  try {
    const ast = parse(content, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
      ranges: false,
      tokens: false
    });

    const metrics: FunctionMetric[] = [];
    walk(ast, (node) => {
      const loc = readNodeLoc(node);
      if (!isFunctionNode(node) || !loc) {
        return;
      }

      const startLine = loc.start.line;
      const endLine = loc.end.line;
      const touchesChangedLine =
        changedLines.size === 0 ||
        [...changedLines].some((line) => line >= startLine && line <= endLine);

      if (!touchesChangedLine) {
        return;
      }

      metrics.push({
        file: change.path,
        line: startLine,
        name: getFunctionName(node),
        lines: endLine - startLine + 1,
        complexity: estimateComplexity(node)
      });
    });

    return metrics;
  } catch {
    return [
      {
        file: change.path,
        line: firstLine(change) ?? 1,
        name: "unparsed source",
        lines: 0,
        complexity: 12
      }
    ];
  }
}
